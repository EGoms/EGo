/*
 * MosaicPipeline.js
 *
 * PixInsight 1.9.4+ feature script (V8 runtime).
 *
 * Orchestrates a two-phase astrometric mosaic pipeline:
 *
 *   Input tiles may be image files on disk or open image windows (entered as
 *   "window:<viewId>"). Windows let you feed tiles you have processed in place
 *   -- e.g. gradient-corrected -- without saving them first.
 *
 *   Phase 1 (both modes):
 *     MosaicByCoordinates  -- reproject every input tile onto a common
 *                             astrometric frame. File inputs are written as
 *                             "<name>_ra.xisf" to the output directory; window
 *                             inputs are reprojected into new windows. MBC's
 *                             own engine and dialog are driven in-process so
 *                             the user confirms projection and dimensions.
 *
 *   Phase 2, mode "Process":
 *     GradientMergeMosaic  -- merges the registered tiles into a single
 *                             seamless mosaic. Fully functional on V8. Window-
 *                             sourced tiles are saved to the output directory
 *                             on demand, since GMM only reads files.
 *
 *   Phase 2, mode "Scripts":
 *     Auto-trim + PhotometricMosaic -- the registered tiles are opened and
 *                             their rough edges eroded in place, reusing
 *                             TrimMosaicTile's logic (MosaicEGo/lib/TrimCore.js).
 *                             PhotometricMosaic is then launched in-process: it
 *                             is included as a library (MosaicEGo/PhotometricMosaic.js
 *                             with PHOTOMETRICMOSAIC_LIBRARY) and its dialog is
 *                             opened on the prepared tiles. It is interactive and
 *                             pairwise, so the user selects the reference/target
 *                             tiles and merges them in its UI (the trim history
 *                             suppresses its soft-edge warning).
 */
#engine v8
#feature-id  MosaicPipeline : EGo > Mosaic Pipeline
#feature-info Astrometric mosaic pipeline. Registers tiles with \
   MosaicByCoordinates, then merges them with either GradientMergeMosaic \
   (process) or the Mosaic-submenu scripts (PhotometricMosaic, etc.).

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Mosaic Pipeline"

// Capture this script's own title/version as runtime constants now, because we
// must #undef the TITLE/VERSION macros further below (PhotometricMosaic defines
// them as functions). The rest of this file uses these constants, not the macros.
const PIPELINE_TITLE   = TITLE;
const PIPELINE_VERSION = VERSION;

// MosaicByCoordinates ships as a PJSR script, not a process, so there is no
// Process.executeScriptGlobal in the V8 runtime. We include its stock engine
// and dialog and reproduce its main() in-process (see runMosaicByCoordinates).
#define SETTINGS_MODULE "MosaicByCoordinates"
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/ImageReprojection.js>
#include <pjsr/astrometry/ProjectionConfigurationDialog.js>
#include <pjsr/astrometry/SearchCoordinatesDialog.js>
#include <pjsr/controls/ViewSelectionDialog.js>
#include "../MosaicByCoordinates/MosaicByCoordinatesDialog.js"
#include "../MosaicByCoordinates/MosaicByCoordinatesEngine.js"

// Edge-erosion primitives shared with MosaicEGo/TrimMosaicTile. TrimCore.js is
// dependency-free (no TITLE/dialog deps), so it coexists with the MBC includes
// above. Used to auto-trim registered tiles before the PhotometricMosaic handoff.
#include "../MosaicEGo/lib/TrimCore.js"

// PhotometricMosaic is a standalone PJSR script that defines function TITLE() and
// function VERSION(), which would clash with the TITLE/VERSION macros above (the
// embedded MosaicByCoordinates needs them). Those macros have already been
// expanded into the MBC includes, so undefine them before pulling PhotometricMosaic
// in as a library. PHOTOMETRICMOSAIC_LIBRARY makes it skip its feature-id and
// main() so it loads quietly; we launch its dialog via launchPhotometricMosaic().
#undef TITLE
#undef VERSION
#define PHOTOMETRICMOSAIC_LIBRARY
#include "../MosaicEGo/PhotometricMosaic.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log( msg )  { console.writeln( "<end><cbr>* " + msg ); }
function warn( msg ) { console.warningln( "<end><cbr>** " + msg ); }
function err( msg )  { console.criticalln( "<end><cbr>*** " + msg ); }

function processAvailable( name )
{
   try { return typeof globalThis[ name ] === "function"; }
   catch ( e ) { return false; }
}

function joinPath( dir, name )
{
   if ( !dir.endsWith( '/' ) )
      dir += '/';
   return dir + name;
}

function registeredOutputPath( inputPath, outputDir, suffix )
{
   let dir = outputDir && outputDir.length > 0
      ? outputDir
      : File.extractDrive( inputPath ) + File.extractDirectory( inputPath );
   return joinPath( dir, File.extractName( inputPath ) + suffix + ".xisf" );
}

// A tile entry is either a file path or "window:<viewId>" (an open window,
// e.g. one that was gradient-corrected in place and never saved). Both are
// understood natively by MosaicByCoordinatesEngine.
function isWindowEntry( entry ) { return entry.startsWith( "window:" ); }

// Describe the registered tile MosaicByCoordinates produces for an input entry.
// File inputs are written to outputDir as "<name><suffix>.xisf"; window inputs
// are reprojected into a new window whose id is "<sourceId><suffix>".
function registeredDescriptor( entry, opts )
{
   if ( isWindowEntry( entry ) )
   {
      let srcId = entry.substring( 7 );
      return { kind: "window", srcId: srcId, regId: srcId + opts.suffix };
   }
   return { kind: "file", path: registeredOutputPath( entry, opts.outputDir, opts.suffix ) };
}

function registeredWindow( regId )
{
   let w = ImageWindow.windowById( regId );
   return ( w && !w.isNull ) ? w : null;
}

// Resolve a registered tile to a file path for GradientMergeMosaic, which only
// accepts files. Window-sourced tiles are saved to outputDir on demand so the
// user never has to save anything by hand.
function registeredPathForMerge( desc, opts )
{
   if ( desc.kind === "file" )
      return desc.path;

   let w = registeredWindow( desc.regId );
   if ( !w )
      throw new Error( "Registered window not found: " + desc.regId );
   let path = joinPath( opts.outputDir, desc.regId + ".xisf" );
   w.saveAs( path, false/*queryOptions*/, false/*allowMessages*/,
             true/*strict*/, false/*verifyOverwrite*/ );
   log( "Saved registered tile to " + path );
   return path;
}

// ---------------------------------------------------------------------------
// Phase 1: MosaicByCoordinates
// ---------------------------------------------------------------------------

function applyMBCParameters( engine, opts )
{
   // Init() reloads persisted settings/parameters; push this run's values back
   // in so the dialog opens pre-filled. All geometry is left on Auto so MBC
   // derives projection/center/resolution/dimensions from the tiles' WCS.
   engine.files            = opts.files.slice();
   engine.centerCoordsAuto = true;
   engine.resolutionAuto   = true;
   engine.rotationAuto     = true;
   engine.projectionAuto   = true;
   engine.dimensionsAuto   = true;
   engine.suffix           = opts.suffix;
   engine.overwrite        = opts.overwrite;
   engine.errorPolicy      = ErrorPolicy.Abort;
   engine.outputDir        = opts.outputDir;
}

function runMosaicByCoordinates( opts )
{
   log( "Launching MosaicByCoordinates - confirm projection/dimensions, then OK." );
   try
   {
      // Reproduce MosaicByCoordinates' own main(): drive its engine through its
      // dialog so the user can confirm the auto-derived frame before executing.
      let engine = new MosaicByCoordinatesEngine;
      for ( ;; )
      {
         engine.Init( ImageWindow.activeWindow );
         applyMBCParameters( engine, opts );

         let dialog = new MosaicByCoordinatesDialog( engine );
         if ( dialog.execute() )
            break;
         if ( dialog.resetRequest )
            engine = new MosaicByCoordinatesEngine;
         else
         {
            warn( "MosaicByCoordinates was cancelled." );
            return false;
         }
      }

      engine.SaveSettings();
      engine.SaveParameters();
      engine.Execute();
   }
   catch ( e )
   {
      err( "MosaicByCoordinates failed to launch: " + e.message );
      return false;
   }

   // Verify each registered tile was produced: a file on disk for file inputs,
   // an open window for window inputs.
   let missing = [];
   for ( let entry of opts.files )
   {
      let desc = registeredDescriptor( entry, opts );
      if ( desc.kind === "file" )
      {
         if ( !File.exists( desc.path ) )
            missing.push( desc.path );
      }
      else if ( !registeredWindow( desc.regId ) )
         missing.push( "window:" + desc.regId );
   }
   if ( missing.length > 0 )
   {
      err( "Registered tiles were not produced (MosaicByCoordinates cancelled or failed):" );
      for ( let m of missing )
         console.criticalln( "  " + m );
      return false;
   }
   return true;
}

// ---------------------------------------------------------------------------
// Phase 2A: GradientMergeMosaic
// ---------------------------------------------------------------------------

function runGradientMergeMosaic( registered, opts )
{
   if ( !processAvailable( "GradientMergeMosaic" ) )
   {
      err( "GradientMergeMosaic process not available on this installation." );
      return false;
   }

   let frames;
   try
   {
      frames = registered.map( d => [ true /*enabled*/, registeredPathForMerge( d, opts ) ] );
   }
   catch ( e )
   {
      err( e.message );
      return false;
   }

   let GMM = new GradientMergeMosaic;
   try { GMM.targetFrames    = frames; } catch ( e ) { err( "GMM.targetFrames: " + e.message ); return false; }
   try { GMM.inputHints      = "";    } catch ( e ) {}
   try { GMM.outputHints     = "";    } catch ( e ) {}
   try { GMM.generateMask    = false; } catch ( e ) {}
   try { GMM.type            = opts.gmmAverage ? GradientMergeMosaic.Average
                                               : GradientMergeMosaic.Overlay; } catch ( e ) {}
   try { GMM.shrinkRadius    = opts.gmmShrink;  } catch ( e ) {}
   try { GMM.featherRadius   = opts.gmmFeather; } catch ( e ) {}
   try { GMM.blackPoint      = 0.0;   } catch ( e ) {}

   log( "Running GradientMergeMosaic on " + frames.length + " registered tiles ..." );
   if ( !GMM.executeGlobal() )
   {
      err( "GradientMergeMosaic failed or was cancelled." );
      return false;
   }
   log( "GradientMergeMosaic finished. The merged mosaic is now an open window." );
   return true;
}

// ---------------------------------------------------------------------------
// Phase 2B: Scripts > Mosaic
// ---------------------------------------------------------------------------

function openRegisteredAsWindows( registered )
{
   let windows = [];
   for ( let d of registered )
   {
      let w = ( d.kind === "window" )
         ? registeredWindow( d.regId )
         : ImageWindow.open( d.path )[0];
      if ( w && !w.isNull )
      {
         w.show();
         windows.push( w );
      }
      else
         warn( "Could not access registered tile: " +
               ( d.kind === "window" ? d.regId : d.path ) );
   }
   return windows;
}

// Erode px pixels from all four edges of an open window, in place, using the
// same primitives as MosaicEGo/TrimMosaicTile (lib/TrimCore.js). A full-image
// bounding box is used: it yields identical results to TrimMosaicTile's
// computed box, just with more scanning. We also stamp TrimMosaicTile HISTORY
// keywords so PhotometricMosaic's "has this been trimmed?" check is satisfied.
function trimWindowEdges( win, px )
{
   let view = win.mainView;
   let image = view.image;
   let box = new Rect( 0, 0, image.width, image.height );

   view.beginProcess( UndoFlag.PixelData | UndoFlag.Keywords );
   trimRows( image, box, px, px, false );    // left, right
   trimColumns( image, box, px, px, false ); // top, bottom

   let kw = win.keywords;
   kw.push( new FITSKeyword( "HISTORY", "", "TrimMosaicTile.target: " + view.fullId ) );
   kw.push( new FITSKeyword( "HISTORY", "", "TrimMosaicTile.top: " + px ) );
   kw.push( new FITSKeyword( "HISTORY", "", "TrimMosaicTile.bottom: " + px ) );
   kw.push( new FITSKeyword( "HISTORY", "", "TrimMosaicTile.left: " + px ) );
   kw.push( new FITSKeyword( "HISTORY", "", "TrimMosaicTile.right: " + px ) );
   win.keywords = kw;
   view.endProcess();
}

function runMosaicScripts( registered, opts )
{
   // PhotometricMosaic is interactive and pairwise, and PJSR has no API to
   // launch another feature script. So the pipeline auto-trims the registered
   // tiles in-process (reusing TrimMosaicTile's logic) and opens them, then
   // hands off to PhotometricMosaic, which the user runs from Script > Mosaic.
   log( "Opening registered tiles ..." );
   let windows = openRegisteredAsWindows( registered );
   if ( windows.length === 0 )
   {
      err( "No registered tiles could be opened." );
      return false;
   }

   if ( opts.runTrim && opts.erodePx > 0 )
   {
      log( "Auto-trimming " + windows.length + " tiles by " + opts.erodePx + " px per edge ..." );
      for ( let w of windows )
      {
         try { trimWindowEdges( w, opts.erodePx ); }
         catch ( e ) { warn( "Trim failed for " + w.mainView.id + ": " + e.message ); }
      }
      log( "Auto-trim done." );
   }

   if ( opts.runPhotometric )
   {
      log( "Tiles ready: " + windows.map( w => w.mainView.id ).join( ", " ) );
      log( "Launching PhotometricMosaic - pick a reference and target tile, then " +
           "merge them pairwise. The tiles are already trimmed, so its soft-edge " +
           "warning will not appear." );
      try
      {
         // PhotometricMosaic is included as a library above; this opens its
         // (interactive, pairwise) dialog on the now-open registered tiles.
         launchPhotometricMosaic();
      }
      catch ( e )
      {
         err( "PhotometricMosaic failed: " + e.message );
         warn( "Run it manually from Script > Mosaic on the open tiles." );
      }
   }

   log( "Scripts phase done." );
   return true;
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

function runPipeline( opts )
{
   console.show();
   console.writeln( "<end><cbr><br>=== " + PIPELINE_TITLE + " " + PIPELINE_VERSION + " ===" );
   log( "Mode: " + opts.mode );
   log( "Tiles: " + opts.files.length );
   log( "Output dir: " + (opts.outputDir || "(same as inputs)") );

   if ( opts.files.length < 2 )
      throw new Error( "Need at least two tiles to build a mosaic." );

   // An output directory is needed when MosaicByCoordinates writes registered
   // files (any file input) or when GradientMergeMosaic needs window-sourced
   // tiles saved to disk (process mode). All-window tiles in scripts mode stay
   // in memory, so no directory is required.
   let hasFileInput = opts.files.some( f => !isWindowEntry( f ) );
   let needsOutputDir = hasFileInput || opts.mode === "process";
   if ( needsOutputDir )
   {
      if ( !opts.outputDir || opts.outputDir.length == 0 )
         throw new Error( "Choose an output directory for the registered tiles." );
      if ( !File.directoryExists( opts.outputDir ) )
         throw new Error( "Output directory does not exist: " + opts.outputDir );
   }

   let E = new ElapsedTime;

   if ( !runMosaicByCoordinates( opts ) )
      return;

   let registered = opts.files.map( f => registeredDescriptor( f, opts ) );

   if ( opts.mode === "process" )
      runGradientMergeMosaic( registered, opts );
   else
      runMosaicScripts( registered, opts );

   log( "Pipeline finished in " + E.text );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

var PipelineDialog = class extends Dialog
{
   constructor()
   {
      super();
      let self = this;
      this.windowTitle = PIPELINE_TITLE + " " + PIPELINE_VERSION;
      this.minWidth = 620;

      // --- File list ---
      this.filesGroup = new GroupBox( this );
      this.filesGroup.title = "Input tiles (files or open windows; must be plate-solved)";

      this.fileList = new TreeBox( this );
      this.fileList.alternateRowColor = true;
      this.fileList.headerVisible = false;
      this.fileList.multipleSelection = true;
      this.fileList.setMinSize( 560, 160 );
      this.fileList.numberOfColumns = 1;

      this.addBtn = new PushButton( this );
      this.addBtn.text = "Add Files...";
      this.addBtn.icon = this.scaledResource( ":/icons/add.png" );
      this.addBtn.onClick = function() {
         let ofd = new OpenFileDialog;
         ofd.multipleSelections = true;
         ofd.caption = "Select mosaic tiles";
         ofd.loadImageFilters();
         if ( ofd.execute() )
            for ( let p of ofd.filePaths ) {
               let node = new TreeBoxNode( self.fileList );
               node.setText( 0, p );
            }
      };

      this.addWinBtn = new PushButton( this );
      this.addWinBtn.text = "Add Windows...";
      this.addWinBtn.icon = this.scaledResource( ":/icons/picture-add.png" );
      this.addWinBtn.toolTip = "Add open image windows as tiles (e.g. after gradient " +
                               "correction), so they need not be saved to disk first.";
      this.addWinBtn.onClick = function() {
         let vsd = new ViewSelectionDialog( true/*onlyWindows*/, false/*singleView*/ );
         vsd.windowTitle = "Select open mosaic tiles";
         if ( vsd.execute() )
            for ( let id of vsd.selectedViews ) {
               let node = new TreeBoxNode( self.fileList );
               node.setText( 0, "window:" + id );
            }
      };

      this.removeBtn = new PushButton( this );
      this.removeBtn.text = "Remove";
      this.removeBtn.icon = this.scaledResource( ":/icons/delete.png" );
      this.removeBtn.onClick = function() {
         for ( let i = self.fileList.numberOfChildren - 1; i >= 0; --i )
            if ( self.fileList.child( i ).selected )
               self.fileList.remove( i );
      };

      this.clearBtn = new PushButton( this );
      this.clearBtn.text = "Clear";
      this.clearBtn.icon = this.scaledResource( ":/icons/clear.png" );
      this.clearBtn.onClick = function() { self.fileList.clear(); };

      let fileBtns = new HorizontalSizer;
      fileBtns.spacing = 6;
      fileBtns.add( this.addBtn );
      fileBtns.add( this.addWinBtn );
      fileBtns.add( this.removeBtn );
      fileBtns.add( this.clearBtn );
      fileBtns.addStretch();

      let filesSizer = new VerticalSizer;
      filesSizer.margin = 6;
      filesSizer.spacing = 4;
      filesSizer.add( this.fileList );
      filesSizer.add( fileBtns );
      this.filesGroup.sizer = filesSizer;

      // --- Output dir + suffix ---
      this.outDirLabel = new Label( this );
      this.outDirLabel.text = "Output directory:";
      this.outDirLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.outDirEdit = new Edit( this );
      this.outDirEdit.text = "";

      this.outDirBtn = new ToolButton( this );
      this.outDirBtn.icon = this.scaledResource( ":/browser/select-file.png" );
      this.outDirBtn.toolTip = "Choose output directory";
      this.outDirBtn.onClick = function() {
         let gd = new GetDirectoryDialog;
         gd.caption = "Output directory for registered tiles";
         if ( gd.execute() )
            self.outDirEdit.text = gd.directoryPath;
      };

      let outDirRow = new HorizontalSizer;
      outDirRow.spacing = 6;
      outDirRow.add( this.outDirLabel );
      outDirRow.add( this.outDirEdit, 100 );
      outDirRow.add( this.outDirBtn );

      this.suffixLabel = new Label( this );
      this.suffixLabel.text = "Registered suffix:";
      this.suffixLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.suffixEdit = new Edit( this );
      this.suffixEdit.text = "_ra";
      this.suffixEdit.setFixedWidth( 100 );

      this.overwriteCB = new CheckBox( this );
      this.overwriteCB.text = "Overwrite existing";
      this.overwriteCB.checked = false;

      let suffixRow = new HorizontalSizer;
      suffixRow.spacing = 6;
      suffixRow.add( this.suffixLabel );
      suffixRow.add( this.suffixEdit );
      suffixRow.addSpacing( 12 );
      suffixRow.add( this.overwriteCB );
      suffixRow.addStretch();

      this.outGroup = new GroupBox( this );
      this.outGroup.title = "Phase 1: MosaicByCoordinates output";
      let outSizer = new VerticalSizer;
      outSizer.margin = 6;
      outSizer.spacing = 4;
      outSizer.add( outDirRow );
      outSizer.add( suffixRow );
      this.outGroup.sizer = outSizer;

      // --- Mode group ---
      this.modeGroup = new GroupBox( this );
      this.modeGroup.title = "Phase 2: Merge method";

      this.modeProcess = new RadioButton( this );
      this.modeProcess.text = "GradientMergeMosaic (process - works now)";
      this.modeProcess.checked = true;

      this.modeScripts = new RadioButton( this );
      this.modeScripts.text = "Scripts > Mosaic (auto-trim, then launch PhotometricMosaic)";

      // GMM options
      this.gmmAvgCB = new CheckBox( this );
      this.gmmAvgCB.text = "Average overlap (uncheck for Overlay)";
      this.gmmAvgCB.checked = true;

      this.gmmShrink = new SpinBox( this );
      this.gmmShrink.minValue = 0;
      this.gmmShrink.maxValue = 64;
      this.gmmShrink.value = 1;

      this.gmmFeather = new SpinBox( this );
      this.gmmFeather.minValue = 0;
      this.gmmFeather.maxValue = 200;
      this.gmmFeather.value = 10;

      let gmmShrinkLabel = new Label( this );
      gmmShrinkLabel.text = "Shrink:";
      gmmShrinkLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      let gmmFeatherLabel = new Label( this );
      gmmFeatherLabel.text = "Feather:";
      gmmFeatherLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      let gmmRow = new HorizontalSizer;
      gmmRow.spacing = 6;
      gmmRow.addSpacing( 20 );
      gmmRow.add( this.gmmAvgCB );
      gmmRow.addSpacing( 12 );
      gmmRow.add( gmmShrinkLabel );
      gmmRow.add( this.gmmShrink );
      gmmRow.add( gmmFeatherLabel );
      gmmRow.add( this.gmmFeather );
      gmmRow.addStretch();

      // Scripts options
      this.runTrimCB = new CheckBox( this );
      this.runTrimCB.text = "Auto-trim tile edges first";
      this.runTrimCB.toolTip = "Erode rough registered-tile edges in place " +
                               "(same logic as TrimMosaicTile) before the handoff.";
      this.runTrimCB.checked = true;

      this.erodePx = new SpinBox( this );
      this.erodePx.minValue = 0;
      this.erodePx.maxValue = 200;
      this.erodePx.value = 5;
      this.erodePx.toolTip = "Pixels to erode from every edge of each tile.";

      let erodeLabel = new Label( this );
      erodeLabel.text = "Erode (px):";
      erodeLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.runPhotoCB = new CheckBox( this );
      this.runPhotoCB.text = "Launch PhotometricMosaic";
      this.runPhotoCB.checked = true;

      let scriptsRow = new HorizontalSizer;
      scriptsRow.spacing = 6;
      scriptsRow.addSpacing( 20 );
      scriptsRow.add( this.runTrimCB );
      scriptsRow.add( erodeLabel );
      scriptsRow.add( this.erodePx );
      scriptsRow.addSpacing( 12 );
      scriptsRow.add( this.runPhotoCB );
      scriptsRow.addStretch();

      let updateMode = function() {
         let isProc = self.modeProcess.checked;
         self.gmmAvgCB.enabled  = isProc;
         self.gmmShrink.enabled = isProc;
         self.gmmFeather.enabled = isProc;
         self.runTrimCB.enabled  = !isProc;
         self.erodePx.enabled    = !isProc && self.runTrimCB.checked;
         self.runPhotoCB.enabled = !isProc;
      };
      this.runTrimCB.onClick = updateMode;
      this.modeProcess.onClick = updateMode;
      this.modeScripts.onClick = updateMode;

      let modeSizer = new VerticalSizer;
      modeSizer.margin = 6;
      modeSizer.spacing = 4;
      modeSizer.add( this.modeProcess );
      modeSizer.add( gmmRow );
      modeSizer.add( this.modeScripts );
      modeSizer.add( scriptsRow );
      this.modeGroup.sizer = modeSizer;
      updateMode();

      // --- Buttons ---
      this.runBtn = new PushButton( this );
      this.runBtn.text = "Run";
      this.runBtn.icon = this.scaledResource( ":/icons/ok.png" );
      this.runBtn.onClick = function() { self.ok(); };

      this.cancelBtn = new PushButton( this );
      this.cancelBtn.text = "Cancel";
      this.cancelBtn.icon = this.scaledResource( ":/icons/cancel.png" );
      this.cancelBtn.onClick = function() { self.cancel(); };

      this.helpBtn = new ToolButton( this );
      this.helpBtn.icon = this.scaledResource( ":/process-interface/browse-documentation.png" );
      this.helpBtn.toolTip = "Browse documentation";
      this.helpBtn.onClick = function() {
         try {
            if ( !Dialog.browseScriptDocumentation( "MosaicPipeline" ) )
               Dialog.openBrowser(
                  "file://" + CoreApplication.binDirPath.replace( /\/bin\/?$/, "" ) +
                  "/doc/scripts/MosaicPipeline/MosaicPipeline.html",
                  "MosaicPipeline Documentation" );
         } catch ( e ) {
            console.warningln( "Could not open docs: " + e.message );
         }
      };

      let btnRow = new HorizontalSizer;
      btnRow.spacing = 6;
      btnRow.add( this.helpBtn );
      btnRow.addStretch();
      btnRow.add( this.runBtn );
      btnRow.add( this.cancelBtn );

      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 6;
      this.sizer.add( this.filesGroup );
      this.sizer.add( this.outGroup );
      this.sizer.add( this.modeGroup );
      this.sizer.add( btnRow );

      this.adjustToContents();
      this.setMinSize();
   }

   collect()
   {
      let files = [];
      for ( let i = 0; i < this.fileList.numberOfChildren; ++i )
         files.push( this.fileList.child( i ).text( 0 ) );

      return {
         files:          files,
         outputDir:      this.outDirEdit.text.trim(),
         suffix:         this.suffixEdit.text.trim() || "_ra",
         overwrite:      this.overwriteCB.checked,
         mode:           this.modeProcess.checked ? "process" : "scripts",
         gmmAverage:     this.gmmAvgCB.checked,
         gmmShrink:      this.gmmShrink.value,
         gmmFeather:     this.gmmFeather.value,
         runTrim:        this.runTrimCB.checked,
         erodePx:        this.erodePx.value,
         runPhotometric: this.runPhotoCB.checked
      };
   }
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(() =>
{
   let dlg = new PipelineDialog;
   if ( dlg.execute() )
      runPipeline( dlg.collect() );
})();
