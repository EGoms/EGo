/*
 * DynamicNarrowbandBlends.js
 *
 * PixInsight 1.9.4+ feature script (V8 compatible).
 *
 * Generates PixelMath process instances for "dynamic" narrowband blends
 * (Coldest Nights / Bill Blanshan PIP style) and spatial split blends
 * (left/right, top/bottom, radial). Each blend has fully expanded
 * formulas with extra Symbols for per-pixel gates and spatial weights;
 * the channel symbols (H, O, S) are still mapped via the Symbols field
 * so a saved icon can be retargeted to different channel image IDs by
 * editing one place.
 *
 * Default symbol bindings (editable in the dialog before generating):
 *   H = Ha    O = OIII   S = SII
 *
 * Two delivery modes:
 *   - ProcessContainer (recommended): one workspace icon containing all
 *     selected blends; double-click to extract individual PixelMath out.
 *   - Sequential: opens the PixelMath dialog for the first selected blend
 *     and exits; re-run for the next one (PixInsight's PixelMath dialog
 *     is a singleton so we can't drop N icons in a single run).
 */
#engine v8
#feature-id DynamicNarrowbandBlends : EGo > Dynamic + Spatial NB Blends
#feature-info  Creates PixelMath process instances for PIP-gated dynamic \
   narrowband blends (Sii/Ha/Oiii Universal, HOO Universal, OIII-gated, \
   combined-emission gates) and spatial split blends (HOO|SHO, HOO|SSO, \
   radial SHO-to-HOO, etc.) Includes combined dynamic + spatial recipes.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Dynamic + Spatial NB Blends"

// ===========================================================================
// Blend catalog
// ===========================================================================
// PixelMath operators used:
//   ~x      = 1 - x                (complement)
//   x^y     = x to the power of y  (so x^~x = x^(1-x))
//   iif(c, t, f)                   per-pixel conditional
//   X(), Y()                       normalized pixel coordinates in [0,1]
//   mtf(m, x)                      midtones transfer function (smooth S-curve)
//   max(...), min(...), sqrt(x)    standard
//
// Symbols field built per blend = channel aliases (H=Ha, O=OIII, S=SII)
// + optional `extraSymbols` (gates, weights, named constants).
//
// `singleExpression: true` produces a mono output (uses only blend.R).

var BLENDS = [
   // ===== Dynamic PIP blends (Coldest Nights style) =====
   {
      id: "Dynamic_SHO_Universal",
      label: "1. Dynamic SHO Universal (Sii/Ha/Oiii)",
      description:
         "PIP-gated SHO<->HOO. Where OIII is bright -> SHO; where OIII is " +
         "weak -> HOO. Smooth per-pixel blend, no manual masking.",
      needs:       [ "H", "O", "S" ],
      extraSymbols: "gO = O^~O, gHO = (H*O)^~(H*O)",
      R: "gO*S + ~gO*H",
      G: "gHO*H + ~gHO*O",
      B: "O"
   },
   {
      id: "Dynamic_HOO_Universal",
      label: "2. Dynamic HOO Universal (Ha/Oiii Bicolor)",
      description:
         "Bicolor: R=Ha, G=PIP-gated Ha<->OIII (based on combined emission), " +
         "B=OIII. No SII needed.",
      needs:       [ "H", "O" ],
      extraSymbols: "gHO = (H*O)^~(H*O)",
      R: "H",
      G: "gHO*H + ~gHO*O",
      B: "O"
   },
   {
      id: "Dynamic_OIII_Gated_R",
      label: "3. Dynamic OIII-Gated SHO",
      description:
         "Only R is dynamic (SHO where OIII bright, HOO-red where OIII weak); " +
         "G=Ha, B=OIII. Simpler than full Universal SHO.",
      needs:       [ "H", "O", "S" ],
      extraSymbols: "gO = O^~O",
      R: "gO*S + ~gO*H",
      G: "H",
      B: "O"
   },
   {
      id: "Dynamic_Combined_Emission",
      label: "4. Dynamic Combined-Emission Gate",
      description:
         "SII contributed to red where BOTH Ha and OIII are strong (combined " +
         "emission). Highlights HII regions overlapping OIII.",
      needs:       [ "H", "O", "S" ],
      extraSymbols: "gHO = (H*O)^~(H*O)",
      R: "gHO*S + ~gHO*H",
      G: "H",
      B: "O"
   },
   {
      id: "Dynamic_Soft_Foraxx",
      label: "5. Soft Foraxx (PIP-smoothed)",
      description:
         "Foraxx-inspired routing with PIP smoothing on Ha and OIII gates.",
      needs:       [ "H", "O", "S" ],
      extraSymbols: "gO = O^~O, gH = H^~H",
      R: "gH*(0.6*S + 0.4*H) + ~gH*H",
      G: "gO*(0.7*H + 0.3*O) + ~gO*O",
      B: "O"
   },
   {
      id: "Dynamic_Ratio_SHO",
      label: "6. Dynamic Ratio-Based SHO",
      description:
         "Routes between SHO and HOO based on per-pixel O/H ratio. " +
         "OIII-dominant pixels lean SHO; Ha-dominant pixels lean HOO.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "rOH = O / max(H, 0.001), " +
         "tR = mtf(0.5, max(0, min(1, rOH)))",
      R: "tR*S + ~tR*H",
      G: "tR*H + ~tR*O",
      B: "O"
   },

   // ===== Spatial split blends =====
   {
      id: "Spatial_HOO_SHO_Hard",
      label: "7. Spatial HARD Split: HOO (left) | SHO (right)",
      description:
         "Sharp vertical split at horizontal midpoint. Visible seam at x=0.5.",
      needs:       [ "H", "O", "S" ],
      R: "iif(X() < 0.5, H, S)",
      G: "iif(X() < 0.5, O, H)",
      B: "O"
   },
   {
      id: "Spatial_HOO_SHO_Soft",
      label: "8. Spatial SOFT Blend: HOO (left) -> SHO (right)",
      description:
         "Smooth horizontal transition centered at x=0.5, ramp width 10%.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
      R: "~t*H + t*S",
      G: "~t*O + t*H",
      B: "O"
   },
   {
      id: "Spatial_HOO_HSO_Soft",
      label: "9. Spatial SOFT Blend: HOO (left) -> HSO (right)",
      description:
         "HOO on left, HSO (Hubble variant) on right with smooth horizontal " +
         "transition. R stays Ha across the whole image.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
      R: "H",
      G: "~t*O + t*S",
      B: "O"
   },
   {
      id: "Spatial_HOO_SSO_Soft",
      label: "10. Spatial SOFT Blend: HOO (left) -> SSO (right)",
      description:
         "HOO on left, SII-doubled SSO on right. Right side gets warm/amber " +
         "look with SII into both R and G.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w)))",
      R: "~t*H + t*S",
      G: "~t*O + t*S",
      B: "O"
   },
   {
      id: "Spatial_SHO_HOO_Vertical",
      label: "11. Spatial SOFT Vertical: SHO (top) -> HOO (bottom)",
      description:
         "SHO on top, HOO on bottom with smooth Y-axis transition.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (Y() - (0.5 - blend_w/2)) / blend_w)))",
      R: "~t*S + t*H",
      G: "~t*H + t*O",
      B: "O"
   },
   {
      id: "Spatial_Radial_SHO_HOO",
      label: "12. Spatial Radial: SHO (center) -> HOO (edges)",
      description:
         "SHO inside an inner radius, HOO outside an outer radius, smooth " +
         "radial transition between them. Useful for centered targets.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "cx = 0.5, cy = 0.5, r_in = 0.20, r_out = 0.50, " +
         "d = sqrt((X()-cx)^2 + (Y()-cy)^2), " +
         "t = mtf(0.5, max(0, min(1, (d - r_in) / (r_out - r_in))))",
      R: "~t*S + t*H",
      G: "~t*H + t*O",
      B: "O"
   },

   // ===== Combined dynamic + spatial =====
   {
      id: "Combined_HOO_DynSHO_Soft",
      label: "13. Combined: HOO (left) -> Dynamic SHO (right)",
      description:
         "Plain HOO on left, PIP-gated dynamic SHO on right, smooth horizontal " +
         "blend in between. Combines spatial routing + per-pixel dynamic gates.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w))), " +
         "gO = O^~O, gHO = (H*O)^~(H*O)",
      R: "~t*H + t*(gO*S + ~gO*H)",
      G: "~t*O + t*(gHO*H + ~gHO*O)",
      B: "O"
   },
   {
      id: "Combined_DynHOO_DynSHO_Soft",
      label: "14. Combined: Dynamic HOO (left) -> Dynamic SHO (right)",
      description:
         "Both halves use PIP gates; horizontal soft blend transitions the " +
         "routing strategy from HOO-style to SHO-style.",
      needs:       [ "H", "O", "S" ],
      extraSymbols:
         "blend_w = 0.10, " +
         "t = mtf(0.5, max(0, min(1, (X() - (0.5 - blend_w/2)) / blend_w))), " +
         "gO = O^~O, gHO = (H*O)^~(H*O)",
      R: "~t*H + t*(gO*S + ~gO*H)",
      G: "gHO*H + ~gHO*O",
      B: "O"
   }
];

// Default symbol bindings (used in PixelMath's Symbols field).
var DEFAULT_SYMBOLS = {
   H: "Ha",
   O: "OIII",
   S: "SII",
   L: "L",
   R: "R",
   G: "G",
   B: "B"
};

// ===========================================================================
// Utilities
// ===========================================================================

function log( s ) { console.writeln( s ); }

// Build the PixelMath Symbols field text. Channel aliases (H=Ha, etc.) are
// listed first; the blend's extraSymbols (gates, weights, named constants)
// are appended after so they can reference the channel aliases.
function buildSymbols( blend, nameMap )
{
   // Scan formulas AND extraSymbols for single-letter channel references.
   var combined =
      ( blend.R || "" )            + " " +
      ( blend.G || "" )            + " " +
      ( blend.B || "" )            + " " +
      ( blend.extraSymbols || "" );

   var keys = [ "H", "O", "S", "L", "R", "G", "B" ];
   var parts = [];
   for ( var i = 0; i < keys.length; ++i )
   {
      var k = keys[ i ];
      var re = new RegExp( "\\b" + k + "\\b" );
      if ( re.test( combined ) )
      {
         var binding = nameMap[ k ] || k;
         parts.push( k + " = " + binding );
      }
   }

   if ( blend.extraSymbols && blend.extraSymbols.length > 0 )
      parts.push( blend.extraSymbols );

   return parts.join( ", " );
}

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

// Create a fully-configured PixelMath instance for a blend.
function buildPixelMath( blend, nameMap )
{
   var P = new PixelMath;

   if ( blend.singleExpression )
   {
      P.expression  = blend.R;
      P.expression1 = "";
      P.expression2 = "";
      P.expression3 = "";
      P.useSingleExpression = true;
   }
   else
   {
      P.expression  = blend.R;
      P.expression1 = blend.G;
      P.expression2 = blend.B;
      P.expression3 = "";
      P.useSingleExpression = false;
   }

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

   P.createNewImage = true;
   P.showNewImage   = true;
   P.newImageId     = blend.id;
   P.newImageWidth  = 0;
   P.newImageHeight = 0;
   P.newImageAlpha  = false;
   try {
      P.newImageColorSpace = blend.singleExpression
                             ? PixelMath.prototype.Gray
                             : PixelMath.prototype.RGB;
      P.newImageSampleFormat = PixelMath.prototype.f32;
   } catch ( e ) { /* constants not present on this build */ }

   return P;
}

// ===========================================================================
// Dialog
// ===========================================================================

var DynamicNarrowbandBlendsDialog = class extends Dialog
{
   constructor()
   {
      super();

      var self = this;
      this.selectedIds  = {};
      this.symbolFields = {};

      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 620;

      // --- Symbol bindings group ----------------------------------------
      this.symbolGroup = new GroupBox( this );
      this.symbolGroup.title = "Channel symbol bindings (PixelMath Symbols field)";
      var symbolGrid = new VerticalSizer;
      symbolGrid.margin  = 6;
      symbolGrid.spacing = 4;

      var keys = [ "H", "O", "S", "L", "R", "G", "B" ];
      for ( var i = 0; i < keys.length; ++i )
      {
         var k = keys[ i ];
         var row = new HorizontalSizer;
         row.spacing = 6;

         var lbl = new Label( this );
         lbl.text = k + " =";
         lbl.minWidth = 36;
         lbl.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

         var ed = new Edit( this );
         ed.text = DEFAULT_SYMBOLS[ k ];
         ed.minWidth = 160;

         this.symbolFields[ k ] = ed;
         row.add( lbl );
         row.add( ed );
         row.addStretch();
         symbolGrid.add( row );
      }
      this.symbolGroup.sizer = symbolGrid;

      // --- Blend list ---------------------------------------------------
      this.blendGroup = new GroupBox( this );
      this.blendGroup.title = "Blends to generate";
      var blendList = new VerticalSizer;
      blendList.margin  = 6;
      blendList.spacing = 3;

      this.blendChecks = [];
      for ( var b = 0; b < BLENDS.length; ++b )
      {
         var blend = BLENDS[ b ];
         var cb = new CheckBox( this );
         cb.text = blend.label + "  (" + blend.needs.join( "," ) + ")";
         cb.checked = true;
         cb.toolTip = blend.description;
         (function ( bRef, cbRef ) {
            cbRef.onClick = function () {
               self.selectedIds[ bRef.id ] = cbRef.checked;
            };
            self.selectedIds[ bRef.id ] = true;
         })( blend, cb );
         this.blendChecks.push( cb );
         blendList.add( cb );
      }
      this.blendGroup.sizer = blendList;

      // --- Select all / none --------------------------------------------
      this.selectAllBtn = new PushButton( this );
      this.selectAllBtn.text = "Select all";
      this.selectAllBtn.onClick = function () {
         for ( var i = 0; i < self.blendChecks.length; ++i )
         {
            self.blendChecks[ i ].checked = true;
            self.selectedIds[ BLENDS[ i ].id ] = true;
         }
      };

      this.selectNoneBtn = new PushButton( this );
      this.selectNoneBtn.text = "Select none";
      this.selectNoneBtn.onClick = function () {
         for ( var i = 0; i < self.blendChecks.length; ++i )
         {
            self.blendChecks[ i ].checked = false;
            self.selectedIds[ BLENDS[ i ].id ] = false;
         }
      };

      var pickRow = new HorizontalSizer;
      pickRow.spacing = 6;
      pickRow.add( this.selectAllBtn );
      pickRow.add( this.selectNoneBtn );
      pickRow.addStretch();

      // --- Delivery mode -----------------------------------------------
      this.deliveryGroup = new GroupBox( this );
      this.deliveryGroup.title = "Delivery mode";
      var deliverySizer = new VerticalSizer;
      deliverySizer.margin  = 6;
      deliverySizer.spacing = 4;

      this.modeContainer = new RadioButton( this );
      this.modeContainer.text = "Bundle into one ProcessContainer icon (recommended)";
      this.modeContainer.checked = true;
      this.modeContainer.toolTip =
         "All selected blends are added to a single ProcessContainer. " +
         "One workspace icon to save; double-click later to see all blends " +
         "and drag individual ones out as needed.";

      this.modeSequential = new RadioButton( this );
      this.modeSequential.text = "Open one blend at a time (script exits after; re-run for next)";
      this.modeSequential.toolTip =
         "Opens the PixelMath dialog for the FIRST selected blend, then " +
         "exits. Drag its title bar to iconize, then re-run the script.";

      deliverySizer.add( this.modeContainer );
      deliverySizer.add( this.modeSequential );
      this.deliveryGroup.sizer = deliverySizer;

      // --- Info note ----------------------------------------------------
      this.note = new Label( this );
      this.note.useRichText = true;
      this.note.wordWrapping = true;
      this.note.text =
         "<i><b>Note:</b> spatial blends (#7-12) use PixInsight's X(), Y() " +
         "coordinate functions (normalized 0-1). Edit the <b>blend_w</b>, " +
         "<b>r_in</b>, <b>r_out</b> constants inside the Symbols field of " +
         "any saved icon to tune the transition width or radii.</i>";
      this.note.minHeight = 56;

      // --- Run / Cancel -------------------------------------------------
      this.runBtn = new PushButton( this );
      this.runBtn.text = " Generate ";
      this.runBtn.defaultButton = true;
      this.runBtn.onClick = function () { this.dialog.ok(); };

      this.cancelBtn = new PushButton( this );
      this.cancelBtn.text = " Cancel ";
      this.cancelBtn.onClick = function () { this.dialog.cancel(); };

      var btnRow = new HorizontalSizer;
      btnRow.spacing = 8;
      btnRow.addStretch();
      btnRow.add( this.runBtn );
      btnRow.add( this.cancelBtn );

      // --- Layout -------------------------------------------------------
      this.sizer = new VerticalSizer;
      this.sizer.margin  = 10;
      this.sizer.spacing = 8;
      this.sizer.add( this.symbolGroup );
      this.sizer.add( this.blendGroup );
      this.sizer.add( pickRow );
      this.sizer.add( this.deliveryGroup );
      this.sizer.add( this.note );
      this.sizer.addSpacing( 6 );
      this.sizer.add( btnRow );

      this.adjustToContents();
      this.setVariableHeight();
   }

   getNameMap()
   {
      var nameMap = {};
      var keys = [ "H", "O", "S", "L", "R", "G", "B" ];
      for ( var i = 0; i < keys.length; ++i )
      {
         var k = keys[ i ];
         var v = this.symbolFields[ k ].text.trim();
         nameMap[ k ] = v || DEFAULT_SYMBOLS[ k ];
      }
      return nameMap;
   }

   getSelectedBlends()
   {
      var out = [];
      for ( var i = 0; i < BLENDS.length; ++i )
         if ( this.selectedIds[ BLENDS[ i ].id ] )
            out.push( BLENDS[ i ] );
      return out;
   }

   getDeliveryMode()
   {
      return this.modeSequential.checked ? "sequential" : "container";
   }
};

// ===========================================================================
// Main
// ===========================================================================

function main()
{
   var dlg = new DynamicNarrowbandBlendsDialog;
   if ( !dlg.execute() )
      return;

   var nameMap  = dlg.getNameMap();
   var selected = dlg.getSelectedBlends();

   if ( selected.length == 0 )
   {
      (new MessageBox(
         "No blends selected.",
         TITLE, StdIcon_Information, StdButton_Ok )).execute();
      return;
   }

   var mode = dlg.getDeliveryMode();

   console.show();
   log( "============================================================" );
   log( TITLE + " v" + VERSION );
   log( "Symbols: " + JSON.stringify( nameMap ) );
   log( "Mode:    " + mode );
   log( "Blends:  " + selected.length );
   log( "============================================================" );

   if ( mode == "sequential" )
      runSequential( selected, nameMap );
   else
      runContainer( selected, nameMap );
}

function runSequential( selected, nameMap )
{
   var blend = selected[ 0 ];
   var P = buildPixelMath( blend, nameMap );

   log( "" );
   log( "[" + blend.id + "] " + blend.label );
   logBlend( blend, P );
   log( "" );
   log( "Launching PixelMath dialog for THIS blend only." );
   log( "Drag the dialog's title bar to the workspace to create an icon," );
   log( "then close PixelMath and re-run this script to do the next one." );
   if ( selected.length > 1 )
   {
      log( "" );
      log( "Remaining selected blends (do them on subsequent runs):" );
      for ( var i = 1; i < selected.length; ++i )
         log( "  - " + selected[ i ].label );
   }

   try { P.launch(); }
   catch ( e ) { log( "LAUNCH FAILED: " + e.toString() ); }
}

function runContainer( selected, nameMap )
{
   var container;
   try {
      container = new ProcessContainer;
   } catch ( e ) {
      log( "ProcessContainer is not available on this PI build." );
      log( "Falling back to sequential mode." );
      runSequential( selected, nameMap );
      return;
   }

   var added = 0;
   for ( var i = 0; i < selected.length; ++i )
   {
      var blend = selected[ i ];
      var P = buildPixelMath( blend, nameMap );
      log( "" );
      log( "[" + blend.id + "] " + blend.label );
      logBlend( blend, P );

      var ok = false;
      try { container.add( P, "" );  ok = true; } catch ( e1 ) {
         try { container.add( P );      ok = true; } catch ( e2 ) {
            log( "  ADD FAILED: " + e2.toString() );
         }
      }
      if ( ok ) ++added;
   }

   log( "" );
   log( "Added " + added + " of " + selected.length + " blend(s) to ProcessContainer." );
   log( "" );
   log( "The ProcessContainer dialog will now open. Drag its title bar to" );
   log( "the workspace to create a single icon containing every blend." );
   log( "To use an individual blend later, double-click the container icon" );
   log( "to open it, then drag the desired contained PixelMath out as its" );
   log( "own separate icon." );

   try { container.launch(); }
   catch ( e ) { log( "CONTAINER LAUNCH FAILED: " + e.toString() ); }
}

function logBlend( blend, P )
{
   log( "  needs:    " + blend.needs.join( ", " ) );
   log( "  symbols:  " + P.symbols );
   if ( blend.singleExpression )
      log( "  formula:  " + blend.R );
   else
   {
      log( "  R:        " + blend.R );
      log( "  G:        " + blend.G );
      log( "  B:        " + blend.B );
   }
}

main();
