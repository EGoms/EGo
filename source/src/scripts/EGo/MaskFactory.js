/*
 * MaskFactory.js
 *
 * PixInsight 1.9.4+ feature script (V8 runtime).
 *
 * Generates the masks most useful for narrowband nebula and broadband
 * galaxy processing, against the active view. Each mask is created as a
 * new image window named "<target>_<maskKind>" so multiple masks can
 * coexist.
 *
 * Available masks:
 *   - Luminance              (CIE L*, optionally inverted)
 *   - Lightness stretched    (GHS-style mid-tones bias for stretched mask)
 *   - Range mask             (RangeSelection with smoothness)
 *   - Highlights mask        (bright-only, for HDR/star protection)
 *   - Shadows mask           (dark-only, for noise reduction)
 *   - Star mask              (via StarXTerminator if installed, else StarMask)
 *   - Inverted star mask     (protect nebula, reveal stars)
 *   - Nebula-only mask       (star-removed luminance: protects stars)
 *   - High-pass mask         (for sharpening localization)
 */
#engine v8
#feature-id  MaskFactory : EGo > Mask Factory
#feature-info Generates luminance, range, star, nebula-only, and high-pass \
   masks for the active view using sane presets for narrowband and \
   broadband targets.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Mask Factory"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processAvailable( name )
{
   try { return typeof globalThis[ name ] === "function"; }
   catch ( e ) { return false; }
}

function log( msg )  { console.writeln( "<end><cbr>* " + msg ); }
function warn( msg ) { console.warningln( "<end><cbr>** " + msg ); }

function uniqueId( base )
{
   let id = base;
   let n = 1;
   while ( !ImageWindow.windowById( id ).isNull )
   {
      id = base + "_" + n;
      ++n;
   }
   return id;
}

// Duplicate a view into a fresh window, returning the new window.
function duplicateView( sourceView, newId )
{
   let src = sourceView.image;
   let win = new ImageWindow(
      src.width, src.height,
      src.numberOfChannels,
      src.bitsPerSample,
      src.isReal,
      src.isColor,
      uniqueId( newId )
   );
   win.mainView.beginProcess( UndoFlag.NoSwapFile );
   win.mainView.image.assign( src );
   win.mainView.endProcess();
   return win;
}

function runPixelMath( targetView, expression, options )
{
   options = options || {};
   let P = new PixelMath;
   P.expression  = expression;
   P.expression1 = "";
   P.expression2 = "";
   P.expression3 = "";
   P.useSingleExpression = true;
   P.symbols     = options.symbols || "";
   P.generateOutput      = options.create ? true : false;
   P.singleThreaded      = false;
   P.optimization        = true;
   P.use64BitWorkingImage = false;
   P.rescale       = false;
   P.truncate      = true;
   P.truncateLower = 0;
   P.truncateUpper = 1;
   P.createNewImage = options.create ? true : false;
   P.showNewImage   = true;
   if ( options.create )
   {
      P.newImageId         = options.newId || uniqueId( "PM_mask" );
      P.newImageWidth      = 0;
      P.newImageHeight     = 0;
      P.newImageAlpha      = false;
      P.newImageColorSpace = PixelMath.Gray;
      P.newImageSampleFormat = PixelMath.f32;
   }
   P.executeOn( targetView );
   return P.createNewImage ? ImageWindow.windowById( P.newImageId ).mainView
                           : targetView;
}

// ---------------------------------------------------------------------------
// Individual mask builders
// ---------------------------------------------------------------------------
// All return the new ImageWindow (or null on failure).

function makeLuminance( srcView, opts )
{
   let id = uniqueId( srcView.id + "_lum" );
   let expr = srcView.image.isColor ? "CIEL($T)" : "$T";
   if ( opts.invert ) expr = "~(" + expr + ")";
   let v = runPixelMath( srcView, expr, { create: true, newId: id } );
   log( "Created luminance mask: " + v.id );
   return v.window;
}

// Stretched luminance: applies a midtones transfer with m=opts.midtones (0..1).
// Default m=0.15 gives a strong shadow lift suitable for protecting nebulosity.
function makeStretchedLuminance( srcView, opts )
{
   let id = uniqueId( srcView.id + "_lumStretched" );
   let m = (opts.midtones !== undefined) ? opts.midtones : 0.15;
   let base = srcView.image.isColor ? "CIEL($T)" : "$T";
   let expr = "mtf(" + format( "%.4f", m ) + "," + base + ")";
   if ( opts.invert ) expr = "~(" + expr + ")";
   let v = runPixelMath( srcView, expr, { create: true, newId: id } );
   log( "Created stretched luminance mask: " + v.id + "  (mtf m=" + m + ")" );
   return v.window;
}

function makeRangeMask( srcView, opts )
{
   if ( !processAvailable( "RangeSelection" ) )
   {
      warn( "RangeSelection process unavailable; falling back to PixelMath threshold." );
      let id = uniqueId( srcView.id + "_range" );
      let lo = opts.lower, hi = opts.upper;
      let base = srcView.image.isColor ? "CIEL($T)" : "$T";
      let expr = "iif(" + base + ">=" + lo + " && " + base + "<=" + hi + ",1,0)";
      let v = runPixelMath( srcView, expr, { create: true, newId: id } );
      return v.window;
   }
   // Duplicate first so we don't destroy source.
   let win = duplicateView( srcView, srcView.id + "_range" );
   let R = new RangeSelection;
   R.lowerLimit = opts.lower;
   R.upperLimit = opts.upper;
   R.fuzziness  = opts.fuzziness;
   R.smoothness = opts.smoothness;
   R.screening  = false;
   R.invert     = !!opts.invert;
   R.executeOn( win.mainView );
   log( "Created range mask: " + win.mainView.id +
        "  [" + opts.lower + "," + opts.upper + "]  smooth=" + opts.smoothness );
   return win;
}

function makeHighlights( srcView, opts )
{
   // Range mask biased to bright pixels - great for HDR / star protection.
   return makeRangeMask( srcView, {
      lower: 0.50, upper: 1.00, fuzziness: 0.15, smoothness: 4.0,
      invert: false
   } );
}

function makeShadows( srcView, opts )
{
   // Dark mask for noise reduction targeting background.
   return makeRangeMask( srcView, {
      lower: 0.00, upper: 0.20, fuzziness: 0.10, smoothness: 4.0,
      invert: false
   } );
}

function makeStarMask( srcView, opts )
{
   if ( processAvailable( "StarXTerminator" ) )
   {
      // Generate stars-only via PixelMath: original - starless.
      let starless = duplicateView( srcView, srcView.id + "_starless" );
      let SX = new StarXTerminator;
      try { SX.stars   = false; } catch ( e ) {}
      try { SX.unscreen = true;  } catch ( e ) {}
      SX.executeOn( starless.mainView );

      let id = uniqueId( srcView.id + "_starMask" );
      let pm = new PixelMath;
      pm.expression = "max(0," + srcView.id + " - " + starless.mainView.id + ")";
      pm.useSingleExpression = true;
      pm.createNewImage = true;
      pm.showNewImage   = true;
      pm.newImageId     = id;
      pm.newImageWidth  = 0;
      pm.newImageHeight = 0;
      pm.newImageAlpha  = false;
      pm.newImageColorSpace  = PixelMath.Gray;
      pm.newImageSampleFormat = PixelMath.f32;
      pm.rescale = false;
      pm.truncate = true;
      pm.truncateLower = 0;
      pm.truncateUpper = 1;
      pm.executeOn( srcView );

      // Convert to luminance mask if source is color.
      let starWin = ImageWindow.windowById( id );
      if ( srcView.image.isColor )
      {
         let lumExpr = "CIEL($T)";
         runPixelMath( starWin.mainView, lumExpr, { create: false } );
      }

      // Boost contrast a touch so stars register as a useful mask.
      runPixelMath( starWin.mainView, "mtf(0.25,$T)", { create: false } );

      if ( !opts.keepStarless )
         starless.forceClose();

      log( "Created star mask via StarXTerminator: " + starWin.mainView.id );
      return starWin;
   }

   if ( !processAvailable( "StarMask" ) )
   {
      warn( "Neither StarXTerminator nor StarMask available; skipping star mask." );
      return null;
   }

   let SM = new StarMask;
   SM.shadowsClipping = 0.00000;
   SM.midtonesBalance = 0.50000;
   SM.highlightsClipping = 1.00000;
   SM.waveletLayers = 8;
   SM.structureContours = false;
   SM.noiseThreshold = 0.10000;
   SM.aggregateStructures = false;
   SM.binarizeStructures = false;
   SM.largeScaleGrowth = 2;
   SM.smallScaleGrowth = 1;
   SM.growthCompensation = 2;
   SM.compensation = 2;
   SM.smoothness = 8;
   SM.invert = false;
   SM.truncation = 1.00000;
   SM.limit = 1.00000;
   SM.mode = StarMask.StarMask;
   SM.executeOn( srcView );
   let m = ImageWindow.activeWindow;
   log( "Created star mask via StarMask: " + m.mainView.id );
   return m;
}

function makeInvertedStarMask( srcView, opts )
{
   let win = makeStarMask( srcView, opts );
   if ( !win ) return null;
   runPixelMath( win.mainView, "~$T", { create: false } );
   log( "Inverted star mask in place: " + win.mainView.id );
   return win;
}

function makeNebulaOnly( srcView, opts )
{
   // Luminance of starless = mask that protects stars while exposing nebula.
   if ( !processAvailable( "StarXTerminator" ) )
   {
      warn( "StarXTerminator required for nebula-only mask; skipping." );
      return null;
   }
   let starless = duplicateView( srcView, srcView.id + "_starless" );
   let SX = new StarXTerminator;
   try { SX.stars   = false; } catch ( e ) {}
   try { SX.unscreen = true;  } catch ( e ) {}
   SX.executeOn( starless.mainView );

   let id = uniqueId( srcView.id + "_nebOnly" );
   let expr = srcView.image.isColor
              ? "CIEL(" + starless.mainView.id + ")"
              : starless.mainView.id;
   if ( opts.stretch )
      expr = "mtf(0.20," + expr + ")";

   let pm = new PixelMath;
   pm.expression = expr;
   pm.useSingleExpression = true;
   pm.createNewImage = true;
   pm.newImageId = id;
   pm.newImageColorSpace = PixelMath.Gray;
   pm.newImageSampleFormat = PixelMath.f32;
   pm.rescale = false;
   pm.truncate = true;
   pm.truncateLower = 0;
   pm.truncateUpper = 1;
   pm.executeOn( srcView );

   if ( !opts.keepStarless )
      starless.forceClose();

   log( "Created nebula-only mask: " + id );
   return ImageWindow.windowById( id );
}

function makeHighPass( srcView, opts )
{
   // Highpass = original - blurred. Useful as a sharpening localization mask.
   let radius = (opts.radius !== undefined) ? opts.radius : 16;
   let blurred = duplicateView( srcView, srcView.id + "_lpf" );
   let conv = new Convolution;
   conv.mode = Convolution.Parametric;
   conv.sigma   = radius / 2.355; // FWHM to sigma
   conv.shape   = 2.0;
   conv.aspectRatio = 1.0;
   conv.rotationAngle = 0.0;
   conv.executeOn( blurred.mainView );

   let id = uniqueId( srcView.id + "_highpass" );
   let base = srcView.image.isColor ? "CIEL($T)" : "$T";
   let baseBlur = srcView.image.isColor
                  ? "CIEL(" + blurred.mainView.id + ")"
                  : blurred.mainView.id;

   let pm = new PixelMath;
   pm.expression = "0.5 + (" + base + " - " + baseBlur + ")";
   pm.useSingleExpression = true;
   pm.createNewImage = true;
   pm.newImageId = id;
   pm.newImageColorSpace = PixelMath.Gray;
   pm.newImageSampleFormat = PixelMath.f32;
   pm.rescale = false;
   pm.truncate = true;
   pm.truncateLower = 0;
   pm.truncateUpper = 1;
   pm.executeOn( srcView );

   blurred.forceClose();
   log( "Created high-pass mask: " + id + "  (radius " + radius + " px)" );
   return ImageWindow.windowById( id );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

var MaskFactoryDialog = class extends Dialog
{
   constructor()
   {
      super();

      let self = this;
      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 520;

      this.targetGroup = new GroupBox( this );
      this.targetGroup.title = "Source view";
      this.targetCombo = new ViewList( this );
      this.targetCombo.getAll();
      let aw = ImageWindow.activeWindow;
      if ( !aw.isNull )
         this.targetCombo.currentView = aw.mainView;
      let tg = new VerticalSizer;
      tg.margin = 6; tg.spacing = 4;
      tg.add( this.targetCombo );
      this.targetGroup.sizer = tg;

      let mk = function ( labelText, defOn, tip ) {
         let cb = new CheckBox( self );
         cb.text = labelText;
         cb.checked = !!defOn;
         if ( tip ) cb.toolTip = tip;
         return cb;
      };

      this.cbLum         = mk( "Luminance",                          true );
      this.cbLumInv      = mk( "Luminance (inverted)",               false );
      this.cbLumStretch  = mk( "Stretched luminance (mtf 0.15)",     true,
         "Strong shadow-lift mask for protecting faint nebulosity." );
      this.cbHigh        = mk( "Highlights mask",                    false );
      this.cbShadow      = mk( "Shadows mask (for NR)",              true,
         "Use as protective mask for background noise reduction." );
      this.cbStars       = mk( "Star mask",                          true );
      this.cbStarsInv    = mk( "Inverted star mask (protect nebula)", false );
      this.cbNeb         = mk( "Nebula-only mask (starless lum)",    true,
         "Requires StarXTerminator. Stretched so faint nebula is visible." );
      this.cbHigh2       = mk( "High-pass mask (sharpening)",        false );

      this.maskGroup = new GroupBox( this );
      this.maskGroup.title = "Masks to generate";
      let mg = new VerticalSizer;
      mg.margin = 6; mg.spacing = 4;
      mg.add( this.cbLum );
      mg.add( this.cbLumInv );
      mg.add( this.cbLumStretch );
      mg.add( this.cbHigh );
      mg.add( this.cbShadow );
      mg.add( this.cbStars );
      mg.add( this.cbStarsInv );
      mg.add( this.cbNeb );
      mg.add( this.cbHigh2 );
      this.maskGroup.sizer = mg;

      // High-pass radius
      this.hpRadius = new NumericEdit( this );
      this.hpRadius.label.text = "High-pass radius (px):";
      this.hpRadius.setRange( 2, 200 );
      this.hpRadius.setPrecision( 0 );
      this.hpRadius.setValue( 16 );

      // Keep starless intermediate?
      this.cbKeepStarless = mk( "Keep starless intermediate windows", false );

      this.okBtn = new PushButton( this );
      this.okBtn.text = "Generate";
      this.okBtn.icon = this.scaledResource( ":/icons/ok.png" );
      this.okBtn.onClick = function() { self.ok(); };

      this.cancelBtn = new PushButton( this );
      this.cancelBtn.text = "Cancel";
      this.cancelBtn.icon = this.scaledResource( ":/icons/cancel.png" );
      this.cancelBtn.onClick = function() { self.cancel(); };


      this.helpBtn = new ToolButton( this );

      this.helpBtn.icon = this.scaledResource( ":/process-interface/browse-documentation.png" );

      this.helpBtn.toolTip = "Browse documentation";

      this.helpBtn.onClick = function() {

         try {

            if ( !Dialog.browseScriptDocumentation( "MaskFactory" ) )
               Dialog.openBrowser(
                  "file://" + CoreApplication.installationDirectory +
                  "/doc/scripts/MaskFactory/MaskFactory.html",
                  "MaskFactory Documentation" );

         } catch ( e ) {

            console.warningln( "Could not open docs: " + e.message );

         }

      };


      let btnRow = new HorizontalSizer;
      btnRow.spacing = 6;

      btnRow.add( this.helpBtn );
      btnRow.addStretch();
      btnRow.add( this.okBtn );
      btnRow.add( this.cancelBtn );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 6;
      this.sizer.add( this.targetGroup );
      this.sizer.add( this.maskGroup );
      this.sizer.add( this.hpRadius );
      this.sizer.add( this.cbKeepStarless );
      this.sizer.add( btnRow );
      this.adjustToContents();
   }
};

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

(() =>
{
   let dlg = new MaskFactoryDialog;
   if ( !dlg.execute() ) return;

   let v = dlg.targetCombo.currentView;
   if ( v.isNull )
   {
      (new MessageBox( "Please pick a source view.", TITLE, StdIcon.Warning )).execute();
      return;
   }

   console.show();
   console.writeln( "<end><cbr><br>=== " + TITLE + " " + VERSION + " ===" );
   log( "Source view: " + v.id );
   let E = new ElapsedTime;

   let keepStarless = dlg.cbKeepStarless.checked;
   let hpRadius     = dlg.hpRadius.value;

   if ( dlg.cbLum.checked )         makeLuminance( v, { invert: false } );
   if ( dlg.cbLumInv.checked )      makeLuminance( v, { invert: true  } );
   if ( dlg.cbLumStretch.checked )  makeStretchedLuminance( v, { midtones: 0.15 } );
   if ( dlg.cbHigh.checked )        makeHighlights( v, {} );
   if ( dlg.cbShadow.checked )      makeShadows( v, {} );
   if ( dlg.cbStars.checked )       makeStarMask( v, { keepStarless: keepStarless } );
   if ( dlg.cbStarsInv.checked )    makeInvertedStarMask( v, { keepStarless: keepStarless } );
   if ( dlg.cbNeb.checked )         makeNebulaOnly( v, { stretch: true, keepStarless: keepStarless } );
   if ( dlg.cbHigh2.checked )       makeHighPass( v, { radius: hpRadius } );

   log( "Done in " + E.text );
})();
