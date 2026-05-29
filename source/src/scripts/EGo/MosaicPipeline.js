/*
 * MosaicPipeline.js
 *
 * PixInsight 1.9.4+ feature script (V8 runtime).
 *
 * Orchestrates a two-phase astrometric mosaic pipeline:
 *
 *   Phase 1 (both modes):
 *     MosaicByCoordinates  -- reproject every input tile onto a common
 *                             astrometric frame. Writes "<name>_ra.xisf"
 *                             files to a chosen output directory. MBC is
 *                             launched as a global script with parameters
 *                             pre-filled; the user confirms projection and
 *                             dimensions in its dialog.
 *
 *   Phase 2, mode "Process":
 *     GradientMergeMosaic  -- merges the registered tiles into a single
 *                             seamless mosaic. Fully functional on V8.
 *
 *   Phase 2, mode "Scripts":
 *     PhotometricMosaic    -- pairwise photometric mosaic merging.
 *     (optional) TrimMosaicTile run beforehand.
 *
 *     These are still on the SpiderMonkey runtime and will not execute on
 *     PixInsight 1.9.4+. The script opens the registered tiles, then tries
 *     to launch each chosen script and reports the failure. Pick this mode
 *     once the scripts are ported.
 */
#engine v8
#feature-id  MosaicPipeline : EGo > Mosaic Pipeline
#feature-info Astrometric mosaic pipeline. Registers tiles with \
   MosaicByCoordinates, then merges them with either GradientMergeMosaic \
   (process) or the Mosaic-submenu scripts (PhotometricMosaic, etc.).

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "Mosaic Pipeline"

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

// ---------------------------------------------------------------------------
// Phase 1: MosaicByCoordinates
// ---------------------------------------------------------------------------

function runMosaicByCoordinates( opts )
{
   // MosaicByCoordinatesEngine is a PersistentObject with prefix "engine";
   // PersistentObject.LoadParameters keys are "engine_<property>".
   Parameters.clear();
   Parameters.set( "engine_files",            opts.files.join( "|" ) );
   Parameters.set( "engine_centerCoordsAuto", true );
   Parameters.set( "engine_resolutionAuto",   true );
   Parameters.set( "engine_rotationAuto",     true );
   Parameters.set( "engine_projectionAuto",   true );
   Parameters.set( "engine_dimensionsAuto",   true );
   Parameters.set( "engine_suffix",           opts.suffix );
   Parameters.set( "engine_overwrite",        opts.overwrite );
   Parameters.set( "engine_errorPolicy",      1 ); // Abort
   Parameters.set( "engine_outputDir",        opts.outputDir );

   log( "Launching MosaicByCoordinates - confirm projection/dimensions, then OK." );
   try
   {
      Process.executeScriptGlobal( "MosaicByCoordinates/MosaicByCoordinates" );
   }
   catch ( e )
   {
      err( "MosaicByCoordinates failed to launch: " + e.message );
      return false;
   }

   // Verify expected output files exist.
   let missing = [];
   for ( let i = 0; i < opts.files.length; ++i )
   {
      let out = registeredOutputPath( opts.files[i], opts.outputDir, opts.suffix );
      if ( !File.exists( out ) )
         missing.push( out );
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

function runGradientMergeMosaic( registeredPaths, opts )
{
   if ( !processAvailable( "GradientMergeMosaic" ) )
   {
      err( "GradientMergeMosaic process not available on this installation." );
      return false;
   }

   let frames = registeredPaths.map( p => [ true /*enabled*/, p ] );

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

function openRegisteredAsWindows( registeredPaths )
{
   let windows = [];
   for ( let p of registeredPaths )
   {
      let w = ImageWindow.open( p )[0];
      if ( w && !w.isNull )
      {
         w.show();
         windows.push( w );
      }
      else
         warn( "Could not open registered tile: " + p );
   }
   return windows;
}

function tryLaunchSpiderMonkeyScript( scriptId )
{
   log( "Launching " + scriptId + " ..." );
   try
   {
      Parameters.clear();
      Process.executeScriptGlobal( scriptId );
      return true;
   }
   catch ( e )
   {
      err( scriptId + " failed: " + e.message );
      warn( "This script is still on the SpiderMonkey runtime and likely " +
            "won't run on this PixInsight version. Skip it until it's ported." );
      return false;
   }
}

function runMosaicScripts( registeredPaths, opts )
{
   warn( "Scripts mode selected. PhotometricMosaic / TrimMosaicTile / " +
         "SplitMosaicTile are still on the SpiderMonkey runtime and will " +
         "not run on PixInsight 1.9.4+ until ported." );
   warn( "Opening registered tiles so they're ready when the scripts work." );

   openRegisteredAsWindows( registeredPaths );

   if ( opts.runTrim )
      tryLaunchSpiderMonkeyScript( "JohnMurphy/PhotometricMosaic/TrimMosaicTile" );

   if ( opts.runPhotometric )
      tryLaunchSpiderMonkeyScript( "JohnMurphy/PhotometricMosaic/PhotometricMosaic" );

   log( "Scripts phase done." );
   return true;
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

function runPipeline( opts )
{
   console.show();
   console.writeln( "<end><cbr><br>=== " + TITLE + " " + VERSION + " ===" );
   log( "Mode: " + opts.mode );
   log( "Tiles: " + opts.files.length );
   log( "Output dir: " + (opts.outputDir || "(same as inputs)") );

   if ( opts.files.length < 2 )
      throw new Error( "Need at least two tiles to build a mosaic." );
   if ( !opts.outputDir || opts.outputDir.length == 0 )
      throw new Error( "Choose an output directory for the registered tiles." );
   if ( !File.directoryExists( opts.outputDir ) )
      throw new Error( "Output directory does not exist: " + opts.outputDir );

   let E = new ElapsedTime;

   if ( !runMosaicByCoordinates( opts ) )
      return;

   let registered = opts.files.map(
      f => registeredOutputPath( f, opts.outputDir, opts.suffix ) );

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
      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 620;

      // --- File list ---
      this.filesGroup = new GroupBox( this );
      this.filesGroup.title = "Input tiles (must be plate-solved)";

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
            for ( let p of ofd.fileNames ) {
               let node = new TreeBoxNode( self.fileList );
               node.setText( 0, p );
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
            self.outDirEdit.text = gd.directory;
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
      this.modeScripts.text = "Scripts > Mosaic (PhotometricMosaic - SpiderMonkey, won't run yet)";

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
      this.runTrimCB.text = "Run TrimMosaicTile first";
      this.runTrimCB.checked = false;

      this.runPhotoCB = new CheckBox( this );
      this.runPhotoCB.text = "Launch PhotometricMosaic";
      this.runPhotoCB.checked = true;

      let scriptsRow = new HorizontalSizer;
      scriptsRow.spacing = 12;
      scriptsRow.addSpacing( 20 );
      scriptsRow.add( this.runTrimCB );
      scriptsRow.add( this.runPhotoCB );
      scriptsRow.addStretch();

      let updateMode = function() {
         let isProc = self.modeProcess.checked;
         self.gmmAvgCB.enabled  = isProc;
         self.gmmShrink.enabled = isProc;
         self.gmmFeather.enabled = isProc;
         self.runTrimCB.enabled  = !isProc;
         self.runPhotoCB.enabled = !isProc;
      };
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
