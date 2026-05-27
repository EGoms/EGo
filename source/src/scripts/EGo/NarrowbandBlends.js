/*
 * NarrowbandBlends.js
 *
 * PixInsight 1.9.4+ feature script (V8 compatible).
 *
 * Generates PixelMath process instances for a curated set of narrowband
 * blend formulas (and a few Ha-into-LRGB recipes). Each blend is opened
 * as its own PixelMath dialog so you can drag the title bar to the
 * workspace to iconize it -- there's no PI scripting API to create a
 * workspace icon directly, so launch-and-iconize is the supported path.
 *
 * Each PixelMath uses single-letter symbols (H, S, O, L, R, G, B) in the
 * formula and maps them to your actual channel image IDs via the
 * PixelMath "Symbols" field. To re-target a saved icon, edit the Symbols
 * field; the formula doesn't need to change.
 *
 * Default symbol bindings (editable in the dialog before generating):
 *   H = Ha    O = OIII   S = SII
 *   L = L     R = R      G = G     B = B
 */
#engine v8
#feature-id NarrowbandBlends : EGo > Narrowband Blend Generator
#feature-info  Creates PixelMath process instances for common narrowband \
   (SHO, HOO, HSO, OHS, HOS, Foraxx-style, dynamic SHO) and Ha-into-LRGB \
   blend recipes. Each blend opens as a PixelMath dialog you can drag to \
   the workspace to save as a process icon.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Narrowband Blend Generator"

// ===========================================================================
// Blend catalog
// ===========================================================================
// Formulas use single-letter symbols. The PixelMath Symbols field maps each
// to a real view ID at apply time. `needs` lists which symbols must be
// defined for the blend to be runnable (informational; not enforced here).
//
// PixelMath syntax notes:
//   max(a,b,c) - per-pixel maximum
//   min(a,b,c) - per-pixel minimum
//   iif(cond, t, f) - per-pixel conditional
//   a^b - exponentiation
//   ~a - 1 - a (complement)
//
// Most of these are bicolor/tricolor mixes that don't need rescaling; for
// safety we enable truncate so output stays in [0,1].

var BLENDS = [
   // ----- Canonical 12 narrowband palettes -----
   {
      id: "Classic_Hubble",
      label: "1. Classic Hubble (SHO)",
      description: "R=SII, G=Ha, B=OIII. General use, gold nebulae.",
      needs:       [ "H", "O", "S" ],
      R: "S",
      G: "H",
      B: "O"
   },
   {
      id: "HOO_Natural",
      label: "2. HOO Natural",
      description: "R=Ha, G=OIII, B=OIII. Natural-looking Ha targets.",
      needs:       [ "H", "O" ],
      R: "H",
      G: "O",
      B: "O"
   },
   {
      id: "Foraxx",
      label: "3. Foraxx",
      description: "R=0.6S+0.4H, G=0.7H+0.3O, B=O. Reduced gold cast, popular.",
      needs:       [ "H", "O", "S" ],
      R: "0.6*S + 0.4*H",
      G: "0.7*H + 0.3*O",
      B: "O"
   },
   {
      id: "HSO_Inverted",
      label: "4. HSO Inverted",
      description: "R=Ha, G=SII, B=OIII. Blue-green Ha, pink SII.",
      needs:       [ "H", "O", "S" ],
      R: "H",
      G: "S",
      B: "O"
   },
   {
      id: "OSH_TealOrange",
      label: "5. OSH Teal-Orange",
      description: "R=OIII, G=SII, B=Ha. High contrast drama.",
      needs:       [ "H", "O", "S" ],
      R: "O",
      G: "S",
      B: "H"
   },
   {
      id: "OHS_Reverse",
      label: "6. OHS Reverse",
      description: "R=OIII, G=Ha, B=SII. Vivid turquoise cores.",
      needs:       [ "H", "O", "S" ],
      R: "O",
      G: "H",
      B: "S"
   },
   {
      id: "Gold_Modified",
      label: "7. Gold Modified",
      description: "R=0.8S+0.2H, G=Ha, B=0.85O+0.15H. Warm, softened blue.",
      needs:       [ "H", "O", "S" ],
      R: "0.8*S + 0.2*H",
      G: "H",
      B: "0.85*O + 0.15*H"
   },
   {
      id: "OHO_OxygenRich",
      label: "8. OHO Oxygen Rich",
      description: "R=0.5O+0.5H, G=OIII, B=OIII. Planetary nebulae, SNRs.",
      needs:       [ "H", "O" ],
      R: "0.5*O + 0.5*H",
      G: "O",
      B: "O"
   },
   {
      id: "Starless_Contrast",
      label: "9. Starless Contrast",
      description: "Threshold-clipped iif() per channel. Post-starless extraction.",
      needs:       [ "H", "O", "S" ],
      R: "iif(S > 0.05, S, 0)",
      G: "iif(H > 0.05, H, 0)",
      B: "iif(O > 0.02, O, 0)"
   },
   {
      id: "Equal_Tricolour",
      label: "10. Equal Tricolour",
      description: "(S+H+O)/3 to all channels. Diagnostic balance check.",
      needs:       [ "H", "O", "S" ],
      R: "(S + H + O) / 3",
      G: "(S + H + O) / 3",
      B: "(S + H + O) / 3"
   },
   {
      id: "Pseudo_RGB",
      label: "11. Pseudo RGB",
      description: "R=SII, G=0.4H+0.6O, B=OIII. Wavelength-mapped natural.",
      needs:       [ "H", "O", "S" ],
      R: "S",
      G: "0.4*H + 0.6*O",
      B: "O"
   },
   {
      id: "HOO_SII_Accent",
      label: "12. HOO + SII Accent",
      description: "R=0.7H+0.3S, G=OIII, B=OIII. HOO with SII structure.",
      needs:       [ "H", "O", "S" ],
      R: "0.7*H + 0.3*S",
      G: "O",
      B: "O"
   },

   // ----- Extra palettes & utilities -----
   {
      id: "HOS_CFHT",
      label: "+ HOS (CFHT Palette)",
      description: "R=Ha, G=OIII, B=SII. CFHT-style palette.",
      needs:       [ "H", "O", "S" ],
      R: "H",
      G: "O",
      B: "S"
   },
   {
      id: "SHO_Synth_L",
      label: "+ SHO Synthetic Luminance",
      description: "max(S, H, O). Mono synthetic L from three NB channels.",
      needs:       [ "H", "O", "S" ],
      singleExpression: true,
      R: "max(S, H, O)"
   },
   {
      id: "HOO_Synth_L",
      label: "+ HOO Synthetic Luminance",
      description: "max(H, O). Mono synthetic L from two NB channels.",
      needs:       [ "H", "O" ],
      singleExpression: true,
      R: "max(H, O)"
   },
   {
      id: "Ha_into_R",
      label: "+ HaRGB (Ha-boosted Red)",
      description: "LRGB with Ha lifted into red. R=max(R, 0.7Ha+0.3R).",
      needs:       [ "R", "G", "B", "H" ],
      R: "max(R, H*0.7 + R*0.3)",
      G: "G",
      B: "B"
   },
   {
      id: "Continuum_Sub_Ha",
      label: "+ Continuum-subtracted Ha",
      description: "max(0, Ha - 0.6*R). Pure-emission Ha mono.",
      needs:       [ "H", "R" ],
      singleExpression: true,
      R: "max(0, H - 0.6*R)"
   },
   {
      id: "LHaRGB",
      label: "+ LHaRGB (Ha into Lum + Red)",
      description: "L = max(L, Ha); R boosted with continuum-subtracted Ha.",
      needs:       [ "L", "R", "G", "B", "H" ],
      R: "max(R, H - 0.5*R)",
      G: "G",
      B: "B"
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

// Build the PixelMath Symbols field text from a name map. Only symbols
// referenced in the blend's formulas are included, plus any user overrides.
function buildSymbols( blend, nameMap )
{
   // Determine which single-letter symbols appear in the blend's formulas.
   var combined = ( blend.R || "" ) + " " + ( blend.G || "" ) + " " + ( blend.B || "" );
   var letters = [];
   var keys = [ "H", "O", "S", "L", "R", "G", "B" ];
   for ( var i = 0; i < keys.length; ++i )
   {
      var k = keys[ i ];
      // \b word boundary requires the symbol stands alone (not part of e.g.
      // "iif" or function names). PixelMath functions are all lowercase,
      // so checking case-sensitive is enough.
      var re = new RegExp( "\\b" + k + "\\b" );
      if ( re.test( combined ) )
         letters.push( k );
   }

   var parts = [];
   for ( var j = 0; j < letters.length; ++j )
   {
      var sym = letters[ j ];
      var binding = nameMap[ sym ] || sym;
      parts.push( sym + " = " + binding );
   }
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

   // Keep output in [0,1] -- safer than rescale across N blends.
   P.rescale       = false;
   P.rescaleLower  = 0;
   P.rescaleUpper  = 1;
   P.truncate      = true;
   P.truncateLower = 0;
   P.truncateUpper = 1;

   // Create a new image when applied. The created window's id is
   // suggested via newImageId; PI will uniquify if needed.
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

var NarrowbandBlendsDialog = class extends Dialog
{
   constructor()
   {
      super();

      var self = this;
      this.selectedIds  = {};      // blend.id -> true if selected
      this.symbolFields = {};      // letter -> Edit control

      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 560;

      // --- Symbol bindings group ----------------------------------------
      this.symbolGroup = new GroupBox( this );
      this.symbolGroup.title = "Symbol bindings (PixelMath Symbols field)";
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

      // --- Blend list ----------------------------------------------------
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
         cb.checked = true;          // default all on
         cb.toolTip = blend.description;
         // Capture blend reference per-iteration via closure.
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

      // --- Info note ----------------------------------------------------
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
         "exits. Drag its title bar to iconize, then re-run the script " +
         "to do the next one. Needed because PixInsight's PixelMath dialog " +
         "is a singleton -- you can't have multiple open at once.";

      deliverySizer.add( this.modeContainer );
      deliverySizer.add( this.modeSequential );
      this.deliveryGroup.sizer = deliverySizer;

      this.note = new Label( this );
      this.note.useRichText = true;
      this.note.wordWrapping = true;
      this.note.text =
         "<i><b>Note:</b> PixInsight allows only one PixelMath dialog at " +
         "a time, so the script can't drop N separate icons in one shot. " +
         "Container mode bundles everything into one icon; sequential " +
         "mode requires re-running the script per blend.</i>";
      this.note.minHeight = 56;

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
   var dlg = new NarrowbandBlendsDialog;
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

// One PixelMath at a time. Launches the first selected blend's dialog and
// exits the script. User iconizes via drag, then re-runs to do the next.
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
      log( "Remaining selected blends (you can do them on subsequent runs):" );
      for ( var i = 1; i < selected.length; ++i )
         log( "  - " + selected[ i ].label );
   }

   try { P.launch(); }
   catch ( e ) { log( "LAUNCH FAILED: " + e.toString() ); }
}

// All selected blends added to a single ProcessContainer. The container's
// dialog opens; user iconizes the container (one drag) and saves it as a
// single .xpsm icon containing every blend.
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
      // ProcessContainer.add signature: (instance, viewIdOrEmpty)
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
   log( "to open it, then drag the desired contained PixelMath onto the" );
   log( "workspace as its own separate icon." );

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
