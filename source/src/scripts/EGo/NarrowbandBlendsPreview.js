/*
 * NarrowbandBlendsPreview.js
 *
 * PixInsight 1.9.4+ feature script (V8 runtime).
 *
 * Live grid preview of the full narrowband blend catalog: static palettes
 * (Classic Hubble, HOO, Foraxx, ...), dynamic PIP-gated recipes, and
 * spatial-split recipes. Pick channel views (H/O/S; plus L/R/G/B for the
 * LRGB-style entries), click Refresh, every blend renders to a downsampled
 * auto-STF'd thumbnail.
 *
 * Click a tile to select; then:
 *   - Open in PixelMath: launch the configured PixelMath dialog. Drag its
 *     title bar to the workspace to save the recipe as a process icon.
 *   - Apply to Active: run the blend in place on the active view
 *     (destructive; use Edit > Undo to revert).
 *
 * The dialog persists across multiple generations; only Exit closes it.
 *
 * This script subsumes the earlier DynamicNarrowbandBlends.js and the
 * static-only NarrowbandBlendsPreview.js. For bundling many static blends
 * into a single workspace icon (ProcessContainer), use
 * Scripts > EGo > Narrowband Blend Icon Factory (NarrowbandBlends.js).
 *
 * Blend recipe schema:
 *   id                : stable internal id (also the suggested newImageId)
 *   label             : human-readable name shown in the UI
 *   description       : tooltip / status text
 *   needs             : array of single-letter symbols required
 *                       (subset of [H,O,S,L,R,G,B])
 *   R, G, B           : PixelMath expressions (or just R when
 *                       singleExpression is true)
 *   singleExpression  : optional; if true, output is mono via R only
 *   extraSymbols      : optional; appended to the PixelMath Symbols field
 *                       to declare helpers like gO = O^~O
 */
#engine v8
#feature-id  NarrowbandBlendsPreview : EGo > NB Blends Live Preview
#feature-info Live grid preview of static + dynamic + spatial narrowband \
   blend recipes. Pick channel views, refresh, click a tile, then Open in \
   PixelMath or Apply to Active.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "3.0.0"
#define TITLE   "NB Blends Live Preview"

// ===========================================================================
// Tunables
// ===========================================================================
var PREVIEW_MAX_DIM = 220;
var GRID_COLUMNS    = 4;

// Auto-STF (same algorithm as StretchComparison.js)
var STF_SHADOWS_CLIPPING  = -2.80;
var STF_TARGET_BACKGROUND = 0.25;

var ALL_KEYS = [ "H", "O", "S", "L", "R", "G", "B" ];

var DEFAULT_SYMBOLS = {
   H: "Ha", O: "OIII", S: "SII",
   L: "L",  R: "R",    G: "G",  B: "B"
};

// ===========================================================================
// Blend catalog
// ===========================================================================
// PixelMath syntax notes:
//   max(a,b,c)       per-pixel maximum
//   iif(cond, t, f)  per-pixel conditional
//   a^b              exponentiation
//   ~a               1 - a (complement)
//   mtf(m, x)        midtones transfer
//   X(), Y()         normalized pixel coordinates [0..1]
//
// Output is truncated to [0,1]; no rescale.

var BLENDS = [
   // ----- Canonical narrowband palettes -----
   { id: "Classic_Hubble",  label: "1. Classic Hubble (SHO)",
     description: "R=SII, G=Ha, B=OIII. General use, gold nebulae.",
     needs: [ "H","O","S" ], R: "S", G: "H", B: "O" },
   { id: "HOO_Natural",     label: "2. HOO Natural",
     description: "R=Ha, G=OIII, B=OIII. Natural-looking Ha targets.",
     needs: [ "H","O" ], R: "H", G: "O", B: "O" },
   { id: "Foraxx",          label: "3. Foraxx",
     description: "R=0.6S+0.4H, G=0.7H+0.3O, B=O.",
     needs: [ "H","O","S" ],
     R: "0.6*S + 0.4*H", G: "0.7*H + 0.3*O", B: "O" },
   { id: "HSO_Inverted",    label: "4. HSO Inverted",
     description: "R=Ha, G=SII, B=OIII.",
     needs: [ "H","O","S" ], R: "H", G: "S", B: "O" },
   { id: "OSH_TealOrange",  label: "5. OSH Teal-Orange",
     description: "R=OIII, G=SII, B=Ha.",
     needs: [ "H","O","S" ], R: "O", G: "S", B: "H" },
   { id: "OHS_Reverse",     label: "6. OHS Reverse",
     description: "R=OIII, G=Ha, B=SII.",
     needs: [ "H","O","S" ], R: "O", G: "H", B: "S" },
   { id: "Gold_Modified",   label: "7. Gold Modified",
     description: "R=0.8S+0.2H, G=Ha, B=0.85O+0.15H.",
     needs: [ "H","O","S" ],
     R: "0.8*S + 0.2*H", G: "H", B: "0.85*O + 0.15*H" },
   { id: "OHO_OxygenRich",  label: "8. OHO Oxygen Rich",
     description: "R=0.5O+0.5H, G=B=OIII.",
     needs: [ "H","O" ],
     R: "0.5*O + 0.5*H", G: "O", B: "O" },
   { id: "Starless_Contrast", label: "9. Starless Contrast",
     description: "iif() threshold-clipped per channel.",
     needs: [ "H","O","S" ],
     R: "iif(S > 0.05, S, 0)",
     G: "iif(H > 0.05, H, 0)",
     B: "iif(O > 0.02, O, 0)" },
   { id: "Equal_Tricolour", label: "10. Equal Tricolour",
     description: "(S+H+O)/3 to all channels.",
     needs: [ "H","O","S" ],
     R: "(S + H + O) / 3", G: "(S + H + O) / 3", B: "(S + H + O) / 3" },
   { id: "Pseudo_RGB",      label: "11. Pseudo RGB",
     description: "R=S, G=0.4H+0.6O, B=O.",
     needs: [ "H","O","S" ],
     R: "S", G: "0.4*H + 0.6*O", B: "O" },
   { id: "HOO_SII_Accent",  label: "12. HOO + SII Accent",
     description: "R=0.7H+0.3S, G=B=OIII.",
     needs: [ "H","O","S" ],
     R: "0.7*H + 0.3*S", G: "O", B: "O" },
   { id: "HOS_CFHT",        label: "+ HOS (CFHT Palette)",
     description: "R=Ha, G=OIII, B=SII.",
     needs: [ "H","O","S" ], R: "H", G: "O", B: "S" },

   // ----- Mono / utility -----
   { id: "SHO_Synth_L",     label: "+ SHO Synth-L",
     description: "max(S, H, O). Mono synthetic L.",
     needs: [ "H","O","S" ], singleExpression: true, R: "max(S, H, O)" },
   { id: "HOO_Synth_L",     label: "+ HOO Synth-L",
     description: "max(H, O). Mono synthetic L.",
     needs: [ "H","O" ], singleExpression: true, R: "max(H, O)" },
   { id: "Ha_into_R",       label: "+ HaRGB (Ha-boosted R)",
     description: "LRGB with Ha lifted into red.",
     needs: [ "R","G","B","H" ],
     R: "max(R, H*0.7 + R*0.3)", G: "G", B: "B" },
   { id: "Continuum_Sub_Ha", label: "+ Continuum-sub Ha",
     description: "max(0, Ha - 0.6*R). Mono.",
     needs: [ "H","R" ], singleExpression: true,
     R: "max(0, H - 0.6*R)" },
   { id: "LHaRGB",          label: "+ LHaRGB",
     description: "L+R+G+B with Ha boost.",
     needs: [ "L","R","G","B","H" ],
     R: "max(R, H - 0.5*R)", G: "G", B: "B" },

   // ----- Dynamic PIP-gated blends -----
   { id: "Dynamic_SHO_Universal",
     label: "Dynamic SHO Universal",
     description: "PIP-gated SHO<->HOO. SHO where OIII bright, HOO where weak.",
     needs: [ "H","O","S" ],
     extraSymbols: "gO = O^~O, gHO = (H*O)^~(H*O)",
     R: "gO*S + ~gO*H", G: "gHO*H + ~gHO*O", B: "O" },
   { id: "Dynamic_HOO_Universal",
     label: "Dynamic HOO Universal",
     description: "Bicolor with PIP-gated G channel; no SII needed.",
     needs: [ "H","O" ],
     extraSymbols: "gHO = (H*O)^~(H*O)",
     R: "H", G: "gHO*H + ~gHO*O", B: "O" },
   { id: "Dynamic_OIII_Gated_R",
     label: "Dynamic OIII-Gated SHO",
     description: "Only R is dynamic; G=Ha, B=OIII.",
     needs: [ "H","O","S" ],
     extraSymbols: "gO = O^~O",
     R: "gO*S + ~gO*H", G: "H", B: "O" },
   { id: "Dynamic_Combined_Emission",
     label: "Dynamic Combined-Emission",
     description: "SII into red where BOTH Ha and OIII are strong.",
     needs: [ "H","O","S" ],
     extraSymbols: "gHO = (H*O)^~(H*O)",
     R: "gHO*S + ~gHO*H", G: "H", B: "O" },
   { id: "Dynamic_Soft_Foraxx",
     label: "Soft Foraxx (PIP-smoothed)",
     description: "Foraxx routing with PIP-smoothed Ha and OIII gates.",
     needs: [ "H","O","S" ],
     extraSymbols: "gO = O^~O, gH = H^~H",
     R: "gH*(0.6*S + 0.4*H) + ~gH*H",
     G: "gO*(0.7*H + 0.3*O) + ~gO*O",
     B: "O" },
   { id: "Dynamic_Ratio_SHO",
     label: "Dynamic Ratio-Based SHO",
     description: "Routes SHO<->HOO by per-pixel O/H ratio.",
     needs: [ "H","O","S" ],
     extraSymbols: "rOH = O / max(H, 0.001), " +
                   "tR = mtf(0.5, max(0, min(1, rOH)))",
     R: "tR*S + ~tR*H", G: "tR*H + ~tR*O", B: "O" },

   // ----- Spatial split blends -----
   { id: "Spatial_HOO_SHO_Hard",
     label: "Spatial HARD: HOO | SHO",
     description: "Sharp vertical split at x=0.5. Visible seam.",
     needs: [ "H","O","S" ],
     R: "iif(X() < 0.5, H, S)", G: "iif(X() < 0.5, O, H)", B: "O" },
   { id: "Spatial_HOO_SHO_Soft",
     label: "Spatial SOFT: HOO -> SHO",
     description: "Smooth x-axis transition, ramp width 10%.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
     R: "~t*H + t*S", G: "~t*O + t*H", B: "O" },
   { id: "Spatial_HOO_HSO_Soft",
     label: "Spatial SOFT: HOO -> HSO",
     description: "R = Ha across; G transitions O -> S.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
     R: "H", G: "~t*O + t*S", B: "O" },
   { id: "Spatial_HOO_SSO_Soft",
     label: "Spatial SOFT: HOO -> SSO",
     description: "Right side warm/amber with SII into R and G.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
     R: "~t*H + t*S", G: "~t*O + t*S", B: "O" },
   { id: "Spatial_SHO_HOO_Vertical",
     label: "Spatial SOFT Vertical: SHO -> HOO",
     description: "Smooth Y-axis transition.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (Y() - (0.5 - blend_w/2)) / blend_w)))",
     R: "~t*S + t*H", G: "~t*H + t*O", B: "O" },
   { id: "Spatial_Radial_SHO_HOO",
     label: "Spatial Radial: SHO -> HOO",
     description: "SHO inside r_in, HOO outside r_out, smooth radial.",
     needs: [ "H","O","S" ],
     extraSymbols: "cx = 0.5, cy = 0.5, r_in = 0.20, r_out = 0.50, " +
                   "d = sqrt((X()-cx)^2 + (Y()-cy)^2), " +
                   "t = mtf(0.5, max(0, min(1, (d - r_in) / (r_out - r_in))))",
     R: "~t*S + t*H", G: "~t*H + t*O", B: "O" },

   // ----- Combined dynamic + spatial -----
   { id: "Combined_HOO_DynSHO_Soft",
     label: "Combined: HOO -> Dyn SHO",
     description: "HOO left, PIP-gated dynamic SHO right, soft x-transition.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w))), " +
                   "gO = O^~O, gHO = (H*O)^~(H*O)",
     R: "~t*H + t*(gO*S + ~gO*H)",
     G: "~t*O + t*(gHO*H + ~gHO*O)",
     B: "O" },
   { id: "Combined_DynHOO_DynSHO_Soft",
     label: "Combined: Dyn HOO -> Dyn SHO",
     description: "Both halves PIP-gated; horizontal soft routing transition.",
     needs: [ "H","O","S" ],
     extraSymbols: "blend_w = 0.10, " +
                   "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w))), " +
                   "gO = O^~O, gHO = (H*O)^~(H*O)",
     R: "~t*H + t*(gO*S + ~gO*H)",
     G: "gHO*H + ~gHO*O",
     B: "O" }
];

// ===========================================================================
// Utilities
// ===========================================================================

function log( s )  { console.writeln( s ); }
function warn( s ) { console.warningln( s ); }

function uniqueId( base )
{
   var id = base, n = 1;
   while ( !ImageWindow.windowById( id ).isNull )
      id = base + "_" + (n++);
   return id;
}

// Build the PixelMath Symbols field for a blend, mapping each single-letter
// symbol referenced by its formulas to the corresponding view id, then
// appending any blend.extraSymbols (helper terms like gO = O^~O).
function buildSymbols( blend, nameMap )
{
   var combined = ( blend.R || "" ) + " " +
                  ( blend.G || "" ) + " " +
                  ( blend.B || "" ) + " " +
                  ( blend.extraSymbols || "" );
   var parts = [];
   for ( var i = 0; i < ALL_KEYS.length; ++i )
   {
      var k = ALL_KEYS[ i ];
      if ( new RegExp( "\\b" + k + "\\b" ).test( combined ) )
         parts.push( k + " = " + ( nameMap[ k ] || k ) );
   }
   if ( blend.extraSymbols && blend.extraSymbols.length > 0 )
      parts.push( blend.extraSymbols );
   return parts.join( ", " );
}

// Configure a PixelMath instance for a blend.
//   opts.createNew    : true to create a fresh image (preview / save-icon)
//   opts.newImageId   : id for that new image
//   opts.showNewImage : show the new image (default: true when createNew)
function buildPixelMath( blend, nameMap, opts )
{
   opts = opts || {};
   var P = new PixelMath;

   if ( blend.singleExpression )
   {
      P.expression  = blend.R;
      P.expression1 = "";
      P.expression2 = "";
      P.useSingleExpression = true;
   }
   else
   {
      P.expression  = blend.R;
      P.expression1 = blend.G;
      P.expression2 = blend.B;
      P.useSingleExpression = false;
   }
   P.expression3 = "";

   P.symbols = buildSymbols( blend, nameMap );

   P.clearImageCacheAndExit = false;
   P.cacheGeneratedImages   = false;
   P.generateOutput         = true;
   P.singleThreaded         = false;
   P.optimization           = true;
   P.use64BitWorkingImage   = false;
   P.rescale       = false;
   P.rescaleLower  = 0;
   P.rescaleUpper  = 1;
   P.truncate      = true;
   P.truncateLower = 0;
   P.truncateUpper = 1;

   var createNew = opts.createNew !== false; // default true
   if ( createNew )
   {
      P.createNewImage = true;
      P.showNewImage   = opts.showNewImage !== undefined ? opts.showNewImage : true;
      P.newImageId     = opts.newImageId || blend.id;
      P.newImageWidth  = 0;
      P.newImageHeight = 0;
      P.newImageAlpha  = false;
      try {
         P.newImageColorSpace = blend.singleExpression
                                ? PixelMath.prototype.Gray
                                : PixelMath.prototype.RGB;
         P.newImageSampleFormat = PixelMath.prototype.f32;
      } catch ( e ) { /* constants not available on this build */ }
   }
   else
   {
      P.createNewImage = false;
   }

   return P;
}

// XISF-roundtrip clone, so resampling the preview copy never touches the
// user's original view. Same trick as GradientComparison.js.
function cloneWindow( srcWindow, newId )
{
   var finalId = uniqueId( newId );
   var tmpPath = File.systemTempDirectory + "/_NBPreview_clone_" +
                 (new Date()).getTime() + "_" +
                 Math.floor( Math.random() * 1e6 ) + ".xisf";
   srcWindow.saveAs( tmpPath, false, false, false, false );
   var opened = ImageWindow.open( tmpPath );
   try { File.remove( tmpPath ); } catch ( e ) {}
   if ( !opened || opened.length == 0 )
      throw new Error( "cloneWindow: no windows returned" );
   var w = opened[ 0 ];
   for ( var i = 1; i < opened.length; ++i )
      try { opened[ i ].forceClose(); } catch ( e ) {}
   w.mainView.id = finalId;
   return w;
}

function resampleInPlace( view, targetMaxDim )
{
   var img = view.image;
   var maxSide = Math.max( img.width, img.height );
   if ( maxSide <= targetMaxDim ) return;
   var scale = targetMaxDim / maxSide;
   var P = new Resample;
   try { P.mode = Resample.prototype.AbsolutePixels; } catch ( e ) {}
   P.xSize = Math.max( 1, Math.round( img.width  * scale ) );
   P.ySize = Math.max( 1, Math.round( img.height * scale ) );
   try { P.interpolation = Resample.prototype.Auto; } catch ( e ) {}
   P.executeOn( view );
}

// ---- Auto-STF (compute + apply via HistogramTransformation) ----
function findMidtonesBalance( x, target )
{
   if ( x <= 0 ) return 0;
   if ( x >= 1 ) return 1;
   if ( Math.abs( target - 0.5 ) < 1e-12 ) return x;
   var denom = 2 * target * x - target - x;
   if ( Math.abs( denom ) < 1e-12 ) return 0.5;
   return ( x * ( target - 1 ) ) / denom;
}

function perChannelSTF( median, avgDev )
{
   var c0 = Math.max( 0, Math.min( 1, median + STF_SHADOWS_CLIPPING * avgDev ) );
   var midtoneInput = Math.max( 0, median - c0 );
   var m  = findMidtonesBalance( midtoneInput, STF_TARGET_BACKGROUND );
   return [ m, c0, 1.0 ];
}

function applyAutoSTF( view )
{
   var image = view.image;
   var isRGB = image.isColor;
   var rows = [
      [ 0, 0.5, 1, 0, 1 ],
      [ 0, 0.5, 1, 0, 1 ],
      [ 0, 0.5, 1, 0, 1 ],
      [ 0, 0.5, 1, 0, 1 ],
      [ 0, 0.5, 1, 0, 1 ]
   ];

   if ( isRGB )
   {
      for ( var c = 0; c < 3; ++c )
      {
         image.selectedChannel = c;
         var med = image.median(), dev = image.avgDev();
         image.resetSelections();
         var s = perChannelSTF( med, dev );
         rows[ c ] = [ s[ 1 ], s[ 0 ], s[ 2 ], 0, 1 ];
      }
   }
   else
   {
      image.selectedChannel = 0;
      var med = image.median(), dev = image.avgDev();
      image.resetSelections();
      var s = perChannelSTF( med, dev );
      var r = [ s[ 1 ], s[ 0 ], s[ 2 ], 0, 1 ];
      rows[ 0 ] = rows[ 1 ] = rows[ 2 ] = r;
   }

   var HT = new HistogramTransformation;
   HT.H = rows;
   HT.executeOn( view );
}

function renderImageToBitmap( image )
{
   try { return image.render(); } catch ( e ) {}
   try { return new Bitmap( image ); } catch ( e ) {}
   try { return image.toBitmap(); } catch ( e ) {}
   return null;
}

// ===========================================================================
// Preview cell
// ===========================================================================

function makeCell( parent, blend, onSelect )
{
   var frame = new Frame( parent );
   frame.frameStyle = FrameStyle.Box;
   frame.lineWidth  = 2;
   frame.minWidth   = PREVIEW_MAX_DIM + 16;
   frame.minHeight  = PREVIEW_MAX_DIM + 60;

   var imgLabel = new Label( parent );
   imgLabel.frameStyle = FrameStyle.Sunken;
   imgLabel.lineWidth  = 1;
   imgLabel.minWidth   = PREVIEW_MAX_DIM;
   imgLabel.minHeight  = PREVIEW_MAX_DIM;
   imgLabel.textAlignment = TextAlignment.Center | TextAlignment.VertCenter;
   imgLabel.text = "(no preview)";

   var nameLabel = new Label( parent );
   nameLabel.text          = blend.label;
   nameLabel.wordWrapping  = true;
   nameLabel.minHeight     = 36;
   nameLabel.textAlignment = TextAlignment.Center | TextAlignment.VertCenter;
   nameLabel.toolTip       = blend.description + "\n\nNeeds: " + blend.needs.join( ", " );

   var sizer = new VerticalSizer;
   sizer.margin  = 4;
   sizer.spacing = 2;
   sizer.add( imgLabel );
   sizer.add( nameLabel );
   frame.sizer = sizer;

   var cell = {
      blend:     blend,
      frame:     frame,
      imgLabel:  imgLabel,
      nameLabel: nameLabel,
      selected:  false,
      hasBitmap: false,

      setBitmap: function ( bmp ) {
         if ( bmp != null ) {
            this.imgLabel.scaledBitmap = bmp;
            this.imgLabel.text         = "";
            this.hasBitmap             = true;
         }
      },
      setError: function ( msg ) {
         this.imgLabel.bitmap = new Bitmap( 1, 1 );
         this.imgLabel.text   = msg;
         this.hasBitmap       = false;
      },
      setSelected: function ( on ) {
         this.selected = on;
         this.frame.lineWidth  = on ? 5 : 2;
         this.frame.styleSheet = on ? "QFrame { border: 3px solid #ffa500; }" : "";
      }
   };

   var clickHandler = function () { onSelect( cell ); };
   frame.onMousePress     = clickHandler;
   imgLabel.onMousePress  = clickHandler;
   nameLabel.onMousePress = clickHandler;

   return cell;
}

// ===========================================================================
// Dialog
// ===========================================================================

var NarrowbandBlendsPreviewDialog = class extends Dialog
{
   constructor()
   {
      super();
      var self = this;

      this.cells        = [];
      this.selectedCell = null;

      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth    = ( PREVIEW_MAX_DIM + 24 ) * GRID_COLUMNS + 60;
      this.minHeight   = 760;

      // ----- Channel view selectors -----
      this.channelLists = {};
      var channelGroup = new GroupBox( this );
      channelGroup.title = "Channel image selectors";
      var chRow1 = new HorizontalSizer; chRow1.spacing = 8;
      var chRow2 = new HorizontalSizer; chRow2.spacing = 8;

      var chSpec = [
         { key: "H", label: "Ha",   row: chRow1 },
         { key: "O", label: "OIII", row: chRow1 },
         { key: "S", label: "SII",  row: chRow1 },
         { key: "L", label: "L",    row: chRow2 },
         { key: "R", label: "R",    row: chRow2 },
         { key: "G", label: "G",    row: chRow2 },
         { key: "B", label: "B",    row: chRow2 }
      ];
      for ( var i = 0; i < chSpec.length; ++i )
      {
         var spec = chSpec[ i ];
         var lbl = new Label( this );
         lbl.text = spec.label + ":";
         lbl.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
         lbl.minWidth = 36;
         var vl = new ViewList( this );
         vl.getMainViews();
         vl.minWidth = 160;
         this.channelLists[ spec.key ] = vl;
         spec.row.add( lbl );
         spec.row.add( vl );
      }

      var chSizer = new VerticalSizer;
      chSizer.margin  = 6;
      chSizer.spacing = 4;
      chSizer.add( chRow1 );
      chSizer.add( chRow2 );
      channelGroup.sizer = chSizer;

      // ----- Refresh + status -----
      this.refreshBtn = new PushButton( this );
      this.refreshBtn.text = " Generate / Refresh Previews ";
      this.refreshBtn.onClick = function () { self.regeneratePreviews(); };

      this.statusLabel = new Label( this );
      this.statusLabel.text = "Select channels, then click Refresh.";
      this.statusLabel.minHeight = 20;

      var refreshRow = new HorizontalSizer;
      refreshRow.spacing = 8;
      refreshRow.add( this.refreshBtn );
      refreshRow.add( this.statusLabel, 100 );

      // ----- Grid of preview cells -----
      var gridSizer = new VerticalSizer;
      gridSizer.spacing = 8;

      var rowSizer = null;
      for ( var b = 0; b < BLENDS.length; ++b )
      {
         if ( ( b % GRID_COLUMNS ) == 0 )
         {
            rowSizer = new HorizontalSizer;
            rowSizer.spacing = 8;
            gridSizer.add( rowSizer );
         }
         var cell = makeCell( this, BLENDS[ b ], function ( c ) { self.selectCell( c ); } );
         this.cells.push( cell );
         rowSizer.add( cell.frame );
      }
      if ( BLENDS.length % GRID_COLUMNS != 0 )
         rowSizer.addStretch();

      var gridScroll = new ScrollBox( this );
      gridScroll.setHorizontalScrollBarPolicy( ScrollBarPolicy.AlwaysOff );
      gridScroll.setVerticalScrollBarPolicy(   ScrollBarPolicy.AsNeeded );
      gridScroll.minHeight = 540;
      gridScroll.viewport.sizer = gridSizer;
      this.gridScroll = gridScroll;

      // ----- Action buttons -----
      this.openBtn = new PushButton( this );
      this.openBtn.text = " Open in PixelMath ";
      this.openBtn.defaultButton = true;
      this.openBtn.toolTip = "Launch a PixelMath dialog with the selected " +
         "blend already configured. Drag its title bar to the workspace " +
         "to save as a process icon.";
      this.openBtn.onClick = function () { self.onOpenInPixelMath(); };

      this.applyBtn = new PushButton( this );
      this.applyBtn.text = " Apply to Active ";
      this.applyBtn.toolTip = "Run the selected blend in place on the " +
         "currently active view. Destructive; use Edit > Undo to revert.";
      this.applyBtn.onClick = function () { self.onApplyToActive(); };

      this.exitBtn = new PushButton( this );
      this.exitBtn.text = " Exit ";
      this.exitBtn.onClick = function () { self.ok(); };

      this.helpBtn = new ToolButton( this );
      this.helpBtn.icon = this.scaledResource( ":/process-interface/browse-documentation.png" );
      this.helpBtn.toolTip = "Browse documentation";
      this.helpBtn.onClick = function () {
         try {
            if ( !Dialog.browseScriptDocumentation( "NarrowbandBlendsPreview" ) )
               Dialog.openBrowser(
                  "file://" + CoreApplication.binDirPath.replace( /\/bin\/?$/, "" ) +
                  "/doc/scripts/NarrowbandBlendsPreview/NarrowbandBlendsPreview.html",
                  "NarrowbandBlendsPreview Documentation" );
         }
         catch ( e ) { console.warningln( "Could not open docs: " + e.message ); }
      };

      var btnRow = new HorizontalSizer;
      btnRow.spacing = 8;
      btnRow.add( this.helpBtn );
      btnRow.addStretch();
      btnRow.add( this.openBtn );
      btnRow.add( this.applyBtn );
      btnRow.add( this.exitBtn );

      // ----- Hint -----
      this.hint = new Label( this );
      this.hint.useRichText  = true;
      this.hint.wordWrapping = true;
      this.hint.text =
         "<i>Click a tile to select. <b>Open in PixelMath</b> launches a " +
         "configured PixelMath dialog at full resolution — drag its title " +
         "bar to iconize. <b>Apply to Active</b> runs the blend in place " +
         "on the active view. This dialog stays open until you click Exit.</i>";
      this.hint.minHeight = 44;

      // ----- Layout -----
      this.sizer = new VerticalSizer;
      this.sizer.margin  = 10;
      this.sizer.spacing = 8;
      this.sizer.add( channelGroup );
      this.sizer.add( refreshRow );
      this.sizer.add( gridScroll, 100 );
      this.sizer.add( this.hint );
      this.sizer.addSpacing( 4 );
      this.sizer.add( btnRow );

      this.adjustToContents();
      this.setVariableHeight();
   }

   selectCell( cell )
   {
      if ( this.selectedCell != null )
         this.selectedCell.setSelected( false );
      this.selectedCell = cell;
      cell.setSelected( true );
      this.statusLabel.text = "Selected: " + cell.blend.label;
   }

   // Read the user's current channel-view bindings. Only keys with a
   // non-null view are populated.
   currentNameMap()
   {
      var map = {};
      for ( var i = 0; i < ALL_KEYS.length; ++i )
      {
         var v = this.channelLists[ ALL_KEYS[ i ] ].currentView;
         if ( v != null && !v.isNull )
            map[ ALL_KEYS[ i ] ] = v.id;
      }
      return map;
   }

   missingChannels( blend, nameMap )
   {
      var missing = [];
      for ( var n = 0; n < blend.needs.length; ++n )
         if ( !nameMap[ blend.needs[ n ] ] )
            missing.push( blend.needs[ n ] );
      return missing;
   }

   regeneratePreviews()
   {
      var nameMap = this.currentNameMap();

      if ( !nameMap.H || !nameMap.O )
      {
         (new MessageBox(
            "At least Ha and OIII must be selected. (Most blends also need SII; " +
            "LRGB-style blends additionally need L/R/G/B.)",
            TITLE, StdIcon_Information, StdButton_Ok )).execute();
         return;
      }

      console.show();
      this.statusLabel.text = "Building downsampled channels...";
      processEvents();

      // ---- 1. Downsample selected channel views ----
      var smallViewIds = {};
      var smallWindows = [];
      try {
         for ( var i = 0; i < ALL_KEYS.length; ++i )
         {
            var k = ALL_KEYS[ i ];
            if ( !nameMap[ k ] ) continue;
            var srcView = this.channelLists[ k ].currentView;
            if ( srcView == null || srcView.isNull ) continue;
            var clone = cloneWindow( srcView.window, "_nbp_" + k );
            smallWindows.push( clone );
            resampleInPlace( clone.mainView, PREVIEW_MAX_DIM );
            smallViewIds[ k ] = clone.mainView.id;
            log( "preview channel: " + k + " -> " + clone.mainView.id +
                 " (" + clone.mainView.image.width + "x" + clone.mainView.image.height + ")" );
         }
      } catch ( e ) {
         warn( "Downsample failed: " + e.toString() );
         this.statusLabel.text = "Downsample failed -- see console.";
         for ( var c = 0; c < smallWindows.length; ++c )
            try { smallWindows[ c ].forceClose(); } catch ( e2 ) {}
         return;
      }

      // ---- 2. For each blend, run PixelMath on small channels ----
      var referenceView = smallWindows[ 0 ].mainView;
      var ok = 0, skipped = 0;
      for ( var bi = 0; bi < BLENDS.length; ++bi )
      {
         var blend = BLENDS[ bi ], cell = this.cells[ bi ];
         var missing = this.missingChannels( blend, smallViewIds );
         if ( missing.length > 0 )
         {
            cell.setError( "Needs: " + missing.join( "," ) );
            ++skipped;
            continue;
         }

         this.statusLabel.text = "Rendering " + ( bi + 1 ) + " / " +
                                  BLENDS.length + ": " + blend.label;
         processEvents();

         var previewId = uniqueId( "_nbp_out_" + bi );
         var P = buildPixelMath( blend, smallViewIds, {
            createNew: true, newImageId: previewId, showNewImage: false
         } );

         var resultWin = null;
         try {
            P.executeOn( referenceView );
            resultWin = ImageWindow.windowById( previewId );
            if ( resultWin.isNull ) { cell.setError( "render failed" ); continue; }
            applyAutoSTF( resultWin.mainView );
            var bmp = renderImageToBitmap( resultWin.mainView.image );
            if ( bmp != null ) { cell.setBitmap( bmp ); ++ok; }
            else cell.setError( "render() unavailable" );
         } catch ( e ) {
            warn( "preview '" + blend.id + "' failed: " + e.toString() );
            cell.setError( "error" );
         } finally {
            if ( resultWin != null && !resultWin.isNull )
               try { resultWin.forceClose(); } catch ( e ) {}
         }
      }

      // ---- 3. Cleanup ----
      for ( var c = 0; c < smallWindows.length; ++c )
         try { smallWindows[ c ].forceClose(); } catch ( e ) {}

      this.statusLabel.text =
         "Previews: " + ok + " rendered, " + skipped + " skipped (missing channels).";
   }

   // Resolve channel bindings for the selected blend at full resolution.
   // Returns the nameMap on success, or null if a required channel is missing
   // (a warning dialog is shown in that case). Unused-but-referenced keys
   // fall back to DEFAULT_SYMBOLS so the PixelMath dialog still validates.
   resolveForSelected()
   {
      if ( this.selectedCell == null )
      {
         (new MessageBox( "Click a tile to select a blend first.",
                          TITLE, StdIcon_Information, StdButton_Ok )).execute();
         return null;
      }
      var blend   = this.selectedCell.blend;
      var nameMap = this.currentNameMap();
      var missing = this.missingChannels( blend, nameMap );
      if ( missing.length > 0 )
      {
         (new MessageBox(
            "Blend '" + blend.label + "' needs channels: " +
            missing.join( ", " ) + "\n\nFill them in above and click " +
            "Refresh, or pick a different blend.",
            TITLE, StdIcon_Warning, StdButton_Ok )).execute();
         return null;
      }
      for ( var i = 0; i < ALL_KEYS.length; ++i )
         if ( !nameMap[ ALL_KEYS[ i ] ] )
            nameMap[ ALL_KEYS[ i ] ] = DEFAULT_SYMBOLS[ ALL_KEYS[ i ] ];
      return { blend: blend, nameMap: nameMap };
   }

   logBlend( blend, P )
   {
      log( "" );
      log( "[" + blend.id + "] " + blend.label );
      log( "  symbols: " + P.symbols );
      if ( blend.singleExpression )
         log( "  formula: " + blend.R );
      else
      {
         log( "  R: " + blend.R );
         log( "  G: " + blend.G );
         log( "  B: " + blend.B );
      }
   }

   onOpenInPixelMath()
   {
      var sel = this.resolveForSelected();
      if ( !sel ) return;
      var P = buildPixelMath( sel.blend, sel.nameMap, { createNew: true } );
      this.logBlend( sel.blend, P );
      log( "Launching PixelMath dialog. Drag its title bar to iconize." );
      try { P.launch(); }
      catch ( e ) {
         warn( "LAUNCH FAILED: " + e.toString() );
         (new MessageBox( "P.launch() failed: " + e.toString(),
                          TITLE, StdIcon_Error, StdButton_Ok )).execute();
      }
   }

   onApplyToActive()
   {
      var sel = this.resolveForSelected();
      if ( !sel ) return;

      var aw = ImageWindow.activeWindow;
      if ( aw.isNull )
      {
         (new MessageBox( "No active window to apply to.",
                          TITLE, StdIcon_Warning, StdButton_Ok )).execute();
         return;
      }
      var av = aw.mainView;
      var confirm = new MessageBox(
         "Apply '" + sel.blend.label + "' in place on view '" + av.id + "'?\n\n" +
         "This is destructive. Use Edit > Undo to revert.",
         TITLE, StdIcon_Question, StdButton_Ok, StdButton_Cancel );
      if ( confirm.execute() != StdButton_Ok ) return;

      var P = buildPixelMath( sel.blend, sel.nameMap, { createNew: false } );
      console.show();
      this.logBlend( sel.blend, P );
      log( "Apply -> " + av.id );
      try {
         if ( !P.executeOn( av ) )
            warn( "Apply cancelled or failed." );
      } catch ( e ) { warn( "Apply failed: " + e.toString() ); }
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
         "No images are open. Open your Ha / OIII / SII (and optionally " +
         "L / R / G / B) channel images and re-run this script.",
         TITLE, StdIcon_Error, StdButton_Ok )).execute();
      return;
   }
   var dlg = new NarrowbandBlendsPreviewDialog;
   dlg.execute();
}

main();
