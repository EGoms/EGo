/*
 * OneClickLinearWorkflow.js
 *
 * PixInsight 1.9.4+ feature script (V8 runtime).
 *
 * Runs a sane linear-stage processing chain on the active view, tuned for
 * the two cases this script's author shoots most:
 *
 *   Narrowband nebulae (default):
 *     1. GradientCorrection         (automatic mode)
 *     2. BlurXTerminator            (non-stellar sharpening tuned for NB)
 *     3. NoiseXTerminator           (mild)
 *     4. (optional) StarXTerminator (split stars / starless)
 *
 *   Broadband galaxies:
 *     1. GradientCorrection
 *     2. ImageSolver dialog         (user confirms plate solve)
 *     3. SPCC dialog                (user picks white reference / filters)
 *     4. BlurXTerminator            (with corrected PSF, galaxy-friendly)
 *     5. NoiseXTerminator
 *     6. (optional) StarXTerminator
 *
 * Each step is reversible (Undo) and the chain stops on the first failure.
 * Third-party processes (BlurXT/NoiseXT/StarXT/GradientCorrection) are
 * detected at runtime; missing ones are skipped with a console warning.
 */
#engine v8
#feature-id  OneClickLinearWorkflow : EGo > One-Click Linear Workflow
#feature-info Linear-stage processing chain: gradient correction, plate \
   solving and SPCC for broadband, BlurXTerminator, NoiseXTerminator, and \
   optional star removal. Narrowband and broadband galaxy presets.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define VERSION "1.0.0"
#define TITLE   "One-Click Linear Workflow"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processAvailable( name )
{
   try { return typeof globalThis[ name ] === "function"; }
   catch ( e ) { return false; }
}

function log( msg )
{
   console.writeln( "<end><cbr>* " + msg );
}

function warn( msg )
{
   console.warningln( "<end><cbr>** " + msg );
}

function runOn( P, view, label )
{
   log( "Running " + label + " ..." );
   if ( !P.executeOn( view ) )
   {
      warn( label + " failed or was cancelled." );
      return false;
   }
   return true;
}

// ---------------------------------------------------------------------------
// Step builders
// ---------------------------------------------------------------------------

function stepGradientCorrection( view )
{
   if ( !processAvailable( "GradientCorrection" ) )
   {
      // Fall back to ABE if GradientCorrection isn't installed.
      if ( !processAvailable( "AutomaticBackgroundExtractor" ) )
      {
         warn( "Neither GradientCorrection nor ABE available; skipping gradient step." );
         return true;
      }
      let ABE = new AutomaticBackgroundExtractor;
      ABE.tolerance        = 1.000;
      ABE.deviation        = 0.800;
      ABE.unbalance        = 1.800;
      ABE.minBoxFraction   = 0.050;
      ABE.maxBackground    = 1.0;
      ABE.minBackground    = 0.0;
      ABE.useBrightnessLimits = false;
      ABE.polyDegree       = 4;
      ABE.boxSize          = 5;
      ABE.boxSeparation    = 5;
      ABE.modelImageSampleFormat = AutomaticBackgroundExtractor.SameAsTarget;
      ABE.abeDownsample    = 2.00;
      ABE.writeSampleBoxes = false;
      ABE.justTrySamples   = false;
      ABE.targetCorrection = AutomaticBackgroundExtractor.Subtract;
      ABE.normalize        = true;
      ABE.discardModel     = true;
      ABE.replaceTarget    = true;
      return runOn( ABE, view, "AutomaticBackgroundExtractor" );
   }

   let GC = new GradientCorrection;
   // Conservative automatic defaults; user can re-tune after.
   try { GC.smoothness = 0.50; } catch ( e ) {}
   try { GC.scale      = 1024; } catch ( e ) {}
   return runOn( GC, view, "GradientCorrection" );
}

function stepBlurXTerminator( view, isNarrowband )
{
   if ( !processAvailable( "BlurXTerminator" ) )
   {
      warn( "BlurXTerminator not installed; skipping." );
      return true;
   }
   let BX = new BlurXTerminator;
   // Narrowband: slightly stronger non-stellar sharpening, lighter stars.
   // Broadband galaxies: balanced.
   if ( isNarrowband )
   {
      try { BX.sharpen_stars       = 0.20; } catch ( e ) {}
      try { BX.adjust_halos        = 0.00; } catch ( e ) {}
      try { BX.nonstellar_then_stellar = false; } catch ( e ) {}
      try { BX.sharpen_nonstellar  = 0.85; } catch ( e ) {}
      try { BX.nonstellar_psf_diameter = 0.00; } catch ( e ) {} // auto
   }
   else
   {
      try { BX.sharpen_stars       = 0.25; } catch ( e ) {}
      try { BX.adjust_halos        = 0.00; } catch ( e ) {}
      try { BX.sharpen_nonstellar  = 0.75; } catch ( e ) {}
      try { BX.nonstellar_psf_diameter = 0.00; } catch ( e ) {}
   }
   return runOn( BX, view, "BlurXTerminator" );
}

function stepNoiseXTerminator( view )
{
   if ( !processAvailable( "NoiseXTerminator" ) )
   {
      warn( "NoiseXTerminator not installed; skipping." );
      return true;
   }
   let NX = new NoiseXTerminator;
   try { NX.detail = 0.15; } catch ( e ) {}
   try { NX.denoise = 0.85; } catch ( e ) {}
   return runOn( NX, view, "NoiseXTerminator" );
}

function stepImageSolver()
{
   // ImageSolver is a script, not a process. The cleanest "one-click" hook
   // for galaxies is to just open the SPCC dialog after a manual solve, but
   // we'll also offer to launch the bundled ImageSolver script if present.
   try
   {
      log( "Opening ImageSolver script - confirm and run, then close." );
      Parameters.clear();
      let path = File.systemTempDirectory + "/.iws_unused";
      // The standard ImageSolver script is at #script-dir/AdP/ImageSolver.js
      Process.executeScriptGlobal( "AdP/ImageSolver" );
      return true;
   }
   catch ( e )
   {
      warn( "Could not launch ImageSolver script automatically: " + e.message );
      warn( "Solve the image manually, then re-run with SPCC enabled." );
      return true;
   }
}

function stepSPCC( view )
{
   if ( !processAvailable( "SpectrophotometricColorCalibration" ) )
   {
      warn( "SPCC not installed on this PixInsight; skipping." );
      return true;
   }
   let SPCC = new SpectrophotometricColorCalibration;
   // Default to broadband filters; user will tweak in dialog.
   try { SPCC.applyCalibration = true; } catch ( e ) {}
   try { SPCC.narrowbandMode   = false; } catch ( e ) {}
   try { SPCC.generateGraphs   = true; } catch ( e ) {}
   try { SPCC.generateStarMaps = false; } catch ( e ) {}
   try { SPCC.targetSourceCount = 8000; } catch ( e ) {}
   log( "Opening SPCC - verify filter selection and white reference, then OK." );
   // Open in interactive mode by launching the process interface.
   SPCC.launch();
   return true;
}

function stepStarXTerminator( view )
{
   if ( !processAvailable( "StarXTerminator" ) )
   {
      warn( "StarXTerminator not installed; skipping star split." );
      return true;
   }
   let SX = new StarXTerminator;
   try { SX.stars   = true; } catch ( e ) {}  // generate stars image
   try { SX.unscreen = true; } catch ( e ) {}
   return runOn( SX, view, "StarXTerminator (split stars/starless)" );
}

// ---------------------------------------------------------------------------
// Chain runner
// ---------------------------------------------------------------------------

function runChain( opts )
{
   let win = ImageWindow.activeWindow;
   if ( win.isNull )
      throw new Error( "No active image window." );
   let view = win.mainView;
   if ( view.isNull )
      throw new Error( "Active window has no main view." );
   if ( !view.image.isColor && opts.mode === "broadband" )
      warn( "Broadband mode selected but the image is mono. SPCC will be skipped." );

   console.show();
   console.writeln( "<end><cbr><br>=== " + TITLE + " " + VERSION + " ===" );
   log( "Target view: " + view.id );
   log( "Mode: " + opts.mode );

   let E = new ElapsedTime;

   if ( opts.gradient )
      if ( !stepGradientCorrection( view ) ) return;

   if ( opts.mode === "broadband" )
   {
      if ( opts.plateSolve )
         stepImageSolver();
      if ( opts.spcc && view.image.isColor )
         stepSPCC( view );
   }

   if ( opts.bxt )
      if ( !stepBlurXTerminator( view, opts.mode === "narrowband" ) ) return;

   if ( opts.nxt )
      if ( !stepNoiseXTerminator( view ) ) return;

   if ( opts.starSplit )
      stepStarXTerminator( view );

   log( "Chain finished in " + E.text );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

var WorkflowDialog = class extends Dialog
{
   constructor()
   {
      super();

      let self = this;
      this.windowTitle = TITLE + " " + VERSION;
      this.minWidth = 480;

      // --- Target mode ---
      this.modeGroup = new GroupBox( this );
      this.modeGroup.title = "Target type";
      let modeSizer = new VerticalSizer;
      modeSizer.margin = 6;
      modeSizer.spacing = 4;

      this.modeNB = new RadioButton( this );
      this.modeNB.text = "Narrowband nebula (skip plate solve and SPCC)";
      this.modeNB.checked = true;

      this.modeBB = new RadioButton( this );
      this.modeBB.text = "Broadband galaxy (plate solve + SPCC)";

      modeSizer.add( this.modeNB );
      modeSizer.add( this.modeBB );
      this.modeGroup.sizer = modeSizer;

      // --- Steps ---
      this.stepGroup = new GroupBox( this );
      this.stepGroup.title = "Steps";
      let stepSizer = new VerticalSizer;
      stepSizer.margin = 6;
      stepSizer.spacing = 4;

      this.cbGradient = new CheckBox( this );
      this.cbGradient.text  = "Gradient correction (GradientCorrection, fallback ABE)";
      this.cbGradient.checked = true;

      this.cbSolve = new CheckBox( this );
      this.cbSolve.text  = "Plate solve (ImageSolver) - broadband only";
      this.cbSolve.checked = true;

      this.cbSPCC = new CheckBox( this );
      this.cbSPCC.text  = "Spectrophotometric Color Calibration - broadband only";
      this.cbSPCC.checked = true;

      this.cbBXT = new CheckBox( this );
      this.cbBXT.text  = "BlurXTerminator";
      this.cbBXT.checked = true;

      this.cbNXT = new CheckBox( this );
      this.cbNXT.text  = "NoiseXTerminator";
      this.cbNXT.checked = true;

      this.cbStar = new CheckBox( this );
      this.cbStar.text  = "Split stars/starless (StarXTerminator)";
      this.cbStar.checked = false;

      stepSizer.add( this.cbGradient );
      stepSizer.add( this.cbSolve );
      stepSizer.add( this.cbSPCC );
      stepSizer.add( this.cbBXT );
      stepSizer.add( this.cbNXT );
      stepSizer.add( this.cbStar );
      this.stepGroup.sizer = stepSizer;

      // Enable/disable broadband-only steps based on mode.
      let updateMode = function() {
         let bb = self.modeBB.checked;
         self.cbSolve.enabled = bb;
         self.cbSPCC.enabled  = bb;
      };
      this.modeNB.onClick = updateMode;
      this.modeBB.onClick = updateMode;
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

            if ( !Dialog.browseScriptDocumentation( "OneClickLinearWorkflow" ) )
               Dialog.openBrowser(
                  "file://" + CoreApplication.binDirPath.replace( /\/bin\/?$/, "" ) +
                  "/doc/scripts/OneClickLinearWorkflow/OneClickLinearWorkflow.html",
                  "OneClickLinearWorkflow Documentation" );

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
      this.sizer.margin  = 8;
      this.sizer.spacing = 6;
      this.sizer.add( this.modeGroup );
      this.sizer.add( this.stepGroup );
      this.sizer.add( btnRow );

      this.adjustToContents();
      this.setFixedSize();
   }

   collect()
   {
      return {
         mode:       this.modeBB.checked ? "broadband" : "narrowband",
         gradient:   this.cbGradient.checked,
         plateSolve: this.cbSolve.checked,
         spcc:       this.cbSPCC.checked,
         bxt:        this.cbBXT.checked,
         nxt:        this.cbNXT.checked,
         starSplit:  this.cbStar.checked
      };
   }
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(() =>
{
   let dlg = new WorkflowDialog;
   if ( dlg.execute() )
      runChain( dlg.collect() );
})();
