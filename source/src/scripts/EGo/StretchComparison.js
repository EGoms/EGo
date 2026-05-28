/*
 * StretchComparison.js
 *
 * PixInsight 1.9.4+ feature script (V8 compatible).
 *
 * Given a target image (mono or color), this script:
 *   1. Clones the target so the ORIGINAL is never modified.
 *   2. Applies each enabled stretch method to an independent clone.
 *   3. Leaves N output windows open for side-by-side comparison.
 *
 * Methods (suffix in parentheses):
 *   - Auto-STF baked into HistogramTransformation  (_STF)
 *   - MaskedStretch                                (_MS)
 *   - ArcsinhStretch                               (_AS)
 *   - GeneralizedHyperbolicStretch                 (_GHS)
 *   - AdaptiveStretch                              (_AdS)
 *
 * Output windows are NOT saved to disk; they stay open in PixInsight.
 * Methods use reasonable defaults intended for a linear-data starting
 * point. Tweak the per-method parameters near the top of each runX()
 * function if you want different behavior.
 */
#engine v8
#feature-id StretchComparison : EGo > Stretch Comparison
#feature-info  Applies multiple non-linear stretches (Auto-STF baked, \
   MaskedStretch, ArcsinhStretch, GHS, AdaptiveStretch) to clones of a \
   target image so they can be compared side-by-side. The original is \
   never modified.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Stretch Comparison"

// ===========================================================================
// Stretch tuning constants
// ===========================================================================

// Auto-STF
var STF_SHADOWS_CLIPPING  = -2.80;   // sigma units (PI default)
var STF_TARGET_BACKGROUND = 0.25;    // mid-tones target (PI default)
var STF_LINK_RGB          = false;   // false -> per-channel auto-stretch

// MaskedStretch
var MS_TARGET_BG          = 0.125;
var MS_ITERATIONS         = 100;
var MS_CLIPPING_FRAC      = 0.00005;

// ArcsinhStretch
var AS_STRETCH            = 100;
var AS_BLACK_POINT        = 0;
var AS_PROTECT_HIGHLIGHTS = false;

// GeneralizedHyperbolicStretch (GHS)
var GHS_D                 = 3.0;     // stretch factor
var GHS_B                 = -1.0;    // local intensity
var GHS_SP                = 0.20;    // symmetry point
var GHS_HP                = 1.0;     // highlight protect
var GHS_LP                = 0.0;     // shadow protect
var GHS_BP                = 0.0;     // black point
var GHS_WP                = 1.0;     // white point

// AdaptiveStretch
var ADS_NOISE_THRESHOLD   = 0.001;
var ADS_CONTRAST_PROTECT  = false;
var ADS_MAX_CURVE_POINTS  = 1000000;

// ===========================================================================
// Method catalog
// ===========================================================================
// Each entry: id (short suffix), label, default-enabled, run function.

function makeMethods() {
   return [
      { id: "STF", label: "Auto-STF baked into HistogramTransformation", on: true,  run: runAutoSTF       },
      { id: "MS",  label: "MaskedStretch",                                on: true,  run: runMaskedStretch },
      { id: "AS",  label: "ArcsinhStretch",                               on: true,  run: runArcsinhStretch },
      { id: "GHS", label: "GeneralizedHyperbolicStretch",                 on: true,  run: runGHS           },
      { id: "AdS", label: "AdaptiveStretch",                              on: true,  run: runAdaptiveStretch }
   ];
}

// ===========================================================================
// Utilities
// ===========================================================================

function log( s ) { console.writeln( s ); }

function uniqueId( base )
{
   var id = base;
   var n = 1;
   while ( !ImageWindow.windowById( id ).isNull )
   {
      id = base + "_" + n;
      ++n;
   }
   return id;
}

function cloneWindow( srcWindow, newId )
{
   var srcImg  = srcWindow.mainView.image;
   var finalId = uniqueId( newId );
   var w = new ImageWindow(
      srcImg.width,
      srcImg.height,
      srcImg.numberOfChannels,
      srcImg.bitsPerSample,
      srcImg.isReal,
      srcImg.isColor,
      finalId
   );
   w.mainView.beginProcess( UndoFlag.NoSwapFile );
   w.mainView.image.assign( srcImg );
   w.mainView.endProcess();

   w.keywords = srcWindow.keywords;
   try {
      if ( typeof w.copyAstrometricSolution == "function" )
         w.copyAstrometricSolution( srcWindow );
   } catch ( e ) { /* not critical */ }

   w.show();
   return w;
}

function trySet( P, name, value )
{
   try { P[ name ] = value; } catch ( e ) { /* parameter not present */ }
}

// MTF: given a normalized input x and a target output, return the midtones
// balance m such that MTF(m, x) = target. Inverse of PI's midtones transfer
// function. Used for the auto-STF computation.
function findMidtonesBalance( x, target )
{
   if ( x <= 0 ) return 0;
   if ( x >= 1 ) return 1;
   if ( Math.abs( target - 0.5 ) < 1e-12 ) return x;
   var denom = 2 * target * x - target - x;
   if ( Math.abs( denom ) < 1e-12 ) return 0.5;
   return ( x * ( target - 1 ) ) / denom;
}

// ===========================================================================
// Auto-STF baked
// ===========================================================================
// Computes the auto-stretch parameters PI would use for the screen transfer
// function, then applies them as a permanent pixel transformation via
// HistogramTransformation.

function computeAutoSTF( view )
{
   var image  = view.image;
   var isRGB  = image.isColor;
   var nChan  = isRGB ? 3 : 1;

   // STF.STF layout: 5 rows of [m, c0, c1, lowBound, highBound]
   // Row 0..2 = R/G/B (or mono replicated), Row 3 = alpha/luminance.
   var STF = [
      [ 0.5, 0.0, 1.0, 0.0, 1.0 ],
      [ 0.5, 0.0, 1.0, 0.0, 1.0 ],
      [ 0.5, 0.0, 1.0, 0.0, 1.0 ],
      [ 0.5, 0.0, 1.0, 0.0, 1.0 ]
   ];

   var meds = [], devs = [];
   for ( var c = 0; c < nChan; ++c )
   {
      image.selectedChannel = c;
      meds.push( image.median() );
      devs.push( image.avgDev() );
      image.resetSelections();
   }

   if ( !STF_LINK_RGB && isRGB )
   {
      for ( var c = 0; c < 3; ++c )
         STF[ c ] = perChannelSTF( meds[ c ], devs[ c ] );
   }
   else
   {
      // Linked / mono -- use channel 0 (or average of RGB if linked).
      var median, avgDev;
      if ( isRGB )
      {
         median = ( meds[ 0 ] + meds[ 1 ] + meds[ 2 ] ) / 3;
         avgDev = ( devs[ 0 ] + devs[ 1 ] + devs[ 2 ] ) / 3;
      }
      else
      {
         median = meds[ 0 ];
         avgDev = devs[ 0 ];
      }
      var row = perChannelSTF( median, avgDev );
      STF[ 0 ] = STF[ 1 ] = STF[ 2 ] = row;
   }

   return STF;
}

function perChannelSTF( median, avgDev )
{
   // PI uses 1.4826 * MAD as a robust sigma estimate; avgDev() returns
   // average absolute deviation which we treat similarly. Clamp c0 to [0,1].
   var c0 = Math.max( 0, Math.min( 1, median + STF_SHADOWS_CLIPPING * avgDev ) );
   var c1 = 1.0;
   var midtoneInput = Math.max( 0, median - c0 );
   var m  = findMidtonesBalance( midtoneInput, STF_TARGET_BACKGROUND );
   return [ m, c0, c1, 0, 1 ];
}

function runAutoSTF( view )
{
   var STF = computeAutoSTF( view );

   // HistogramTransformation.H layout: 5 rows of [c0, m, c1, lowRange, highRange]
   // -- note the column order differs from STF: [m, c0, c1] -> [c0, m, c1].
   var HT = new HistogramTransformation;
   HT.H = [
      [ STF[ 0 ][ 1 ], STF[ 0 ][ 0 ], STF[ 0 ][ 2 ], 0, 1 ],
      [ STF[ 1 ][ 1 ], STF[ 1 ][ 0 ], STF[ 1 ][ 2 ], 0, 1 ],
      [ STF[ 2 ][ 1 ], STF[ 2 ][ 0 ], STF[ 2 ][ 2 ], 0, 1 ],
      [ STF[ 3 ][ 1 ], STF[ 3 ][ 0 ], STF[ 3 ][ 2 ], 0, 1 ],
      [ 0,             0.5,           1,             0, 1 ]
   ];
   HT.executeOn( view );
}

// ===========================================================================
// MaskedStretch
// ===========================================================================

function runMaskedStretch( view )
{
   var P = new MaskedStretch;
   trySet( P, "targetBackground",     MS_TARGET_BG );
   trySet( P, "numberOfIterations",   MS_ITERATIONS );
   trySet( P, "clippingFraction",     MS_CLIPPING_FRAC );
   trySet( P, "backgroundReferenceViewId", "" );
   trySet( P, "backgroundLow",        0.0 );
   trySet( P, "backgroundHigh",       1.0 );
   trySet( P, "useROI",               false );
   trySet( P, "maskType",             0 ); // 0 = None / default
   P.executeOn( view );
}

// ===========================================================================
// ArcsinhStretch
// ===========================================================================

function runArcsinhStretch( view )
{
   var P = new ArcsinhStretch;
   trySet( P, "stretch",            AS_STRETCH );
   trySet( P, "blackPoint",         AS_BLACK_POINT );
   trySet( P, "protectHighlights",  AS_PROTECT_HIGHLIGHTS );
   trySet( P, "useNewImage",        false );
   P.executeOn( view );
}

// ===========================================================================
// GeneralizedHyperbolicStretch (GHS)
// ===========================================================================

function runGHS( view )
{
   var P = new GeneralizedHyperbolicStretch;
   try {
      P.stretchType = GeneralizedHyperbolicStretch.prototype.GeneralisedHyperbolic;
   } catch ( e ) {
      trySet( P, "stretchType", 0 );
   }
   trySet( P, "inverse",          false );
   trySet( P, "stretchFactor",    GHS_D );
   trySet( P, "localIntensity",   GHS_B );
   trySet( P, "symmetryPoint",    GHS_SP );
   trySet( P, "highlightProtect", GHS_HP );
   trySet( P, "shadowProtect",    GHS_LP );
   trySet( P, "blackPoint",       GHS_BP );
   trySet( P, "whitePoint",       GHS_WP );
   trySet( P, "useColorBlend",    true );
   P.executeOn( view );
}

// ===========================================================================
// AdaptiveStretch
// ===========================================================================

function runAdaptiveStretch( view )
{
   var P = new AdaptiveStretch;
   trySet( P, "noiseThreshold",     ADS_NOISE_THRESHOLD );
   trySet( P, "contrastProtection", ADS_CONTRAST_PROTECT );
   trySet( P, "contrastLimit",      0.0 );
   trySet( P, "maxCurvePoints",     ADS_MAX_CURVE_POINTS );
   trySet( P, "useROI",             false );
   P.executeOn( view );
}

// ===========================================================================
// Pipeline
// ===========================================================================

function runPipeline( targetWin, methods )
{
   var baseId = targetWin.mainView.id;

   log( "============================================================" );
   log( TITLE + " v" + VERSION );
   log( "Target: " + baseId );
   log( "Methods: " + methods.map( function ( m ) { return m.id; } ).join( ", " ) );
   log( "============================================================" );

   for ( var i = 0; i < methods.length; ++i )
   {
      var m = methods[ i ];
      var suffix = "_" + m.id;
      var clone  = cloneWindow( targetWin, baseId + suffix );
      var startTime = ( new Date() ).getTime();

      log( "[" + m.id + "] " + m.label + " on " + clone.mainView.id + " ..." );
      try {
         m.run( clone.mainView );
         var dt = ( new Date() ).getTime() - startTime;
         log( "[" + m.id + "] done in " + dt + " ms -> " + clone.mainView.id );
      } catch ( e ) {
         log( "[" + m.id + "] ERROR: " + e.toString() );
      }
   }

   log( "" );
   log( "Done. Original window '" + baseId + "' was not modified." );
}

// ===========================================================================
// Dialog
// ===========================================================================

var StretchComparisonDialog = class extends Dialog
{
   constructor()
   {
      super();
      var self = this;

      this.methods = makeMethods();

      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 520;

      // --- Target image -------------------------------------------------
      this.targetLabel = new Label( this );
      this.targetLabel.text = "Target image:";
      this.targetLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      this.targetLabel.minWidth = 120;

      this.targetView = new ViewList( this );
      this.targetView.getMainViews();

      var targetRow = new HorizontalSizer;
      targetRow.spacing = 6;
      targetRow.add( this.targetLabel );
      targetRow.add( this.targetView, 100 );

      // --- Method checkboxes -------------------------------------------
      this.methodGroup = new GroupBox( this );
      this.methodGroup.title = "Stretch methods to apply";
      var methodList = new VerticalSizer;
      methodList.margin  = 6;
      methodList.spacing = 4;

      this.methodChecks = [];
      for ( var i = 0; i < this.methods.length; ++i )
      {
         var m = this.methods[ i ];
         var cb = new CheckBox( this );
         cb.text = m.label + "   ( _" + m.id + " )";
         cb.checked = m.on;
         (function ( mRef, cbRef ) {
            cbRef.onClick = function () { mRef.on = cbRef.checked; };
         })( m, cb );
         this.methodChecks.push( cb );
         methodList.add( cb );
      }
      this.methodGroup.sizer = methodList;

      // --- Run / Cancel -------------------------------------------------
      this.runBtn = new PushButton( this );
      this.runBtn.text = " Run ";
      this.runBtn.defaultButton = true;
      this.runBtn.onClick = function () { this.dialog.ok(); };

      this.cancelBtn = new PushButton( this );
      this.cancelBtn.text = " Cancel ";
      this.cancelBtn.onClick = function () { this.dialog.cancel(); };


      this.helpBtn = new ToolButton( this );

      this.helpBtn.icon = this.scaledResource( ":/process-interface/browse-documentation.png" );

      this.helpBtn.toolTip = "Browse documentation";

      this.helpBtn.onClick = function() {

         try {

            if ( !Dialog.browseScriptDocumentation( "StretchComparison" ) )
               Dialog.openBrowser(
                  "file://" + CoreApplication.binDirPath.replace( /\/bin\/?$/, "" ) +
                  "/doc/scripts/StretchComparison/StretchComparison.html",
                  "StretchComparison Documentation" );

         } catch ( e ) {

            console.warningln( "Could not open docs: " + e.message );

         }

      };


      var btnRow = new HorizontalSizer;
      btnRow.spacing = 8;

      btnRow.add( this.helpBtn );
      btnRow.addStretch();
      btnRow.add( this.runBtn );
      btnRow.add( this.cancelBtn );

      // --- Layout -------------------------------------------------------
      this.sizer = new VerticalSizer;
      this.sizer.margin  = 10;
      this.sizer.spacing = 8;
      this.sizer.add( targetRow );
      this.sizer.add( this.methodGroup );
      this.sizer.addSpacing( 6 );
      this.sizer.add( btnRow );

      this.adjustToContents();
      this.setVariableHeight();
   }

   getSelectedMethods()
   {
      var out = [];
      for ( var i = 0; i < this.methods.length; ++i )
         if ( this.methods[ i ].on )
            out.push( this.methods[ i ] );
      return out;
   }
};

// ===========================================================================
// Main
// ===========================================================================

function main()
{
   if ( ImageWindow.windows.length == 0 )
   {
      (new MessageBox(
         "No images are open. Open the image you want to stretch " +
         "and re-run this script.",
         TITLE, StdIcon_Error, StdButton_Ok )).execute();
      return;
   }

   var dlg = new StretchComparisonDialog;
   if ( !dlg.execute() )
      return;

   var view = dlg.targetView.currentView;
   if ( view == null || view.isNull )
   {
      (new MessageBox(
         "No target image selected.",
         TITLE, StdIcon_Error, StdButton_Ok )).execute();
      return;
   }

   var methods = dlg.getSelectedMethods();
   if ( methods.length == 0 )
   {
      (new MessageBox(
         "No stretch methods selected.",
         TITLE, StdIcon_Information, StdButton_Ok )).execute();
      return;
   }

   console.show();
   runPipeline( view.window, methods );
}

main();
