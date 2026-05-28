#engine v8

/* global HORIZONTAL, TITLE, ImageWindow, UndoFlag.NoSwapFile, Parameters, View, VERTICAL, Dialog, VERSION, TextAlignment.Right, TextAlignment.VertCenter, StdIcon.Error, StdButton.Ok, DataType.Int32, Settings, KEYPREFIX, DataType.UCString */

"use strict";
#feature-id SplitMosaicTile : Mosaic EGo > SplitMosaicTile

#feature-icon @script_icons_dir/SplitMosaicTile.svg

#feature-info Splits an image into two overlapping images.<br/>\
Copyright &copy; 2019-2023 John Murphy.<br/>

CoreApplication.ensureMinimumVersion( 1, 9, 4 );


#include "lib/DialogLib.js"

#define VERSION  "4.0.1"
#define TITLE "SplitMosaicTile"
#define HORIZONTAL 0
#define VERTICAL 1
#define KEYPREFIX "SplitMosaicTile"

/**
 * Controller. Processing starts here!
 * @param {SplitData} data Values from user interface
 */
function splitImage(data)
{
    let startTime = new Date().getTime();
    let targetView = data.targetView;
    console.writeln("Target: ", targetView.fullId);
    let isHorizontal;
    if (data.orientation === HORIZONTAL){
        console.writeln("<b>Mode: Horizontal Split</b>");
        isHorizontal = true;
    } else {
        console.writeln("<b>Mode: Vertical Split</b>");
        isHorizontal = false;
    }

    createSplitImages(targetView, data, isHorizontal);

    console.noteln("\n" + TITLE + ": Total time ", getElapsedTime(startTime));
}

/**
 * Create two overlapping images from the supplied target image
 * @param {View} tgtView Contains the image to be split into two
 * @param {SplitData} data Values from user interface
 * @param {Boolean} isHorizontal True if left / right split
 * @returns {undefined}
 */
function createSplitImages(tgtView, data, isHorizontal) {
    const coord = data.coordinate;
    const overlap = data.overlap;
    const width = tgtView.image.width;
    const height = tgtView.image.height;

    // Clone the target view and image
    if (isHorizontal){
        let eraseRect2 = new Rect(0, 0, coord - overlap, height);
        CopyImageEraseArea(tgtView, data, eraseRect2, "_Right");
        let eraseRect1 = new Rect(coord + overlap, 0, width, height);
        CopyImageEraseArea(tgtView, data, eraseRect1, "_Left");
    } else {
        let eraseRect2 = new Rect(0, 0, width, coord - overlap);
        CopyImageEraseArea(tgtView, data, eraseRect2, "_Bottom");
        let eraseRect1 = new Rect(0, coord + overlap, width, height);
        CopyImageEraseArea(tgtView, data, eraseRect1, "_Top");
    }
}

/**
 * Copy the target image, erase specified rectangle, display new window
 * @param {View} tgtView
 * @param {SplitData} data
 * @param {Rect} eraseRect
 * @param {String} titlePostfix
 */
function CopyImageEraseArea(tgtView, data, eraseRect, titlePostfix){
    const width = tgtView.image.width;
    const height = tgtView.image.height;
    const nChannels = tgtView.image.isColor ? 3 : 1;
    let keywords = tgtView.window.keywords;
    let w = tgtView.window;
    let imgWindow = new ImageWindow(1, 1, nChannels, w.bitsPerSample,
            w.isFloatSample, nChannels > 1, tgtView.fullId + titlePostfix);
    imgWindow.mainView.beginProcess(UndoFlag.NoSwapFile);
    let view = imgWindow.mainView;
    view.image.assign(tgtView.image);
    view.image.fill(0, eraseRect, 0, nChannels - 1);
    view.window.keywords = keywords;
    view.endProcess();
    view.stf = tgtView.stf;
    imgWindow.zoomToFit();
    imgWindow.show();
}

// -----------------------------------------------------------------------------
// Form/Dialog data
// -----------------------------------------------------------------------------
function SplitData() {
    // Used to populate the contents of a saved process icon
    this.saveParameters = function () {
        if (this.targetView.isNull) {
            Parameters.remove("targetView");
        } else {
            Parameters.set("targetView", this.targetView.fullId);
        }
        Parameters.set("orientation", this.orientation);
        Parameters.set("overlap", this.overlap);
        Parameters.set("coordinate", this.coordinate);
    };

    // Reload our script's data from a process icon
    this.loadParameters = function () {
        if (Parameters.has("orientation"))
            this.orientation = Parameters.getInteger("orientation");
        if (Parameters.has("overlap"))
            this.overlap = Parameters.getInteger("overlap");
        if (Parameters.has("coordinate"))
            this.coordinate = Parameters.getInteger("coordinate");
        if (Parameters.has("targetView")) {
            let viewId = Parameters.getString("targetView");
            this.targetView = viewByIdSafe(viewId);
        }
    };

    // Initialise the scripts data
    this.setParameters = function () {
        if (this.targetView === undefined){
            this.targetView = new View();
        }
        this.orientation = VERTICAL;
        this.overlap = 50;
        this.coordinate = 500;
    };

    // Used when the user presses the reset button
    this.resetParameters = function (splitDialog) {
        this.setParameters();
        splitDialog.orientationCombo.currentItem = VERTICAL;
        splitDialog.overlap_Control.setValue(this.overlap);
        splitDialog.coordinate_Control.setValue(this.coordinate);
    };

    // Initialise the script's data
    this.setParameters();
}

/**
 * Save all script parameters as settings keys.
 * @param {TrimImageData} data
 */
function saveSettings(data){
    resetSettings();
    if (!data.targetView.isNull) {
        Settings.write( KEYPREFIX+"/targetView", DataType.UCString, data.targetView.fullId);
    }
    Settings.write( KEYPREFIX+"/orientation", DataType.Int32, data.orientation );
    Settings.write( KEYPREFIX+"/overlap", DataType.Int32, data.overlap );
    Settings.write( KEYPREFIX+"/coordinate", DataType.Int32, data.coordinate );
    console.writeln("\nSaved settings");
}

// A function to delete all previously stored settings keys for this script.
function resetSettings(){
   Settings.remove( KEYPREFIX );
}

/**
 * Restore all script parameters from settings keys.
 * @param {PhotometricMosaicData} data
 */
function restoreSettings(data){
    var keyValue;
    keyValue = Settings.read( KEYPREFIX+"/targetView", DataType.UCString );
    if ( Settings.lastReadOK ){
        let viewId = keyValue;
        data.targetView = viewByIdSafe(viewId);
    }
    keyValue = Settings.read( KEYPREFIX+"/orientation", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.orientation = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/overlap", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.overlap = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/coordinate", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.coordinate = keyValue;
}

// The main dialog function
class SplitDialog extends Dialog
{
constructor(data)
{
super();

    //-------------------------------------------------------
    // Set some basic widths from dialog text
    //-------------------------------------------------------
    let labelWidth1 = this.font.width("Split Coordinate:_");

    //-------------------------------------------------------
    // Create the Program Description at the top
    //-------------------------------------------------------
    let titleLabel = createTitleLabel("<b>" + TITLE + " v" + VERSION +
            "</b> &mdash; Splits an image into two overlapping images.<br />" +
            "Used to 'slice and dice' an ad-hoc mosaic to create a mosaic of rows and columns.<br />" +
            "Copyright &copy; 2019-2023 John Murphy.");

    //-------------------------------------------------------
    // Create the target image field
    //-------------------------------------------------------
    let targetImage_Label = new Label(this);
    targetImage_Label.text = "Target view:";
    targetImage_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    targetImage_Label.minWidth = labelWidth1;

    this.targetImage_ViewList = new ViewList(this);
    this.targetImage_ViewList.getMainViews();
    this.targetImage_ViewList.minWidth = 300;
    this.targetImage_ViewList.currentView = data.targetView;
    this.targetImage_ViewList.toolTip = "<p>Image to split</p>";
    this.targetImage_ViewList.onViewSelected = function (view) {
        data.targetView = view;
        if (!data.targetView.isNull){
            if (data.orientation === VERTICAL){
                this.dialog.coordinate_Control.setRange(0, view.image.height);
                this.dialog.coordinate_Control.slider.setRange(0, view.image.height);
            } else {
                this.dialog.coordinate_Control.setRange(0, view.image.width);
                this.dialog.coordinate_Control.slider.setRange(0, view.image.width);
            }
            data.coordinate = this.dialog.coordinate_Control.value;
        }
    };

    let targetImage_Sizer = new HorizontalSizer;
    targetImage_Sizer.spacing = 4;
    targetImage_Sizer.add(targetImage_Label);
    targetImage_Sizer.add(this.targetImage_ViewList, 100);

    //-------------------------------------------------------
    // Orientation
    //-------------------------------------------------------
    let algorithm_Label = new Label(this);
    algorithm_Label.text = "Split direction:";
    algorithm_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    algorithm_Label.minWidth = labelWidth1;

    this.orientationCombo = new ComboBox(this);
    this.orientationCombo.editEnabled = false;
    this.orientationCombo.minWidth = this.font.width("Horizontal");
    this.orientationCombo.addItem("Left/Right");
    this.orientationCombo.addItem("Top/Bottom");
    this.orientationCombo.currentItem = data.orientation;
    this.orientationCombo.onItemSelected = function () {
        data.orientation = this.currentItem;
        if (!data.targetView.isNull){
            if (data.orientation === VERTICAL){
                this.dialog.coordinate_Control.setRange(0, data.targetView.image.height);
                this.dialog.coordinate_Control.slider.setRange(0, data.targetView.image.height);
            } else {
                this.dialog.coordinate_Control.setRange(0, data.targetView.image.width);
                this.dialog.coordinate_Control.slider.setRange(0, data.targetView.image.width);
            }
            data.coordinate = this.dialog.coordinate_Control.value;
        }
    };

    let orientationSizer = new HorizontalSizer;
    orientationSizer.spacing = 4;
    orientationSizer.add(algorithm_Label);
    orientationSizer.add(this.orientationCombo);
    orientationSizer.addStretch();

    //-------------------------------------------------------
    // Coordinate
    //-------------------------------------------------------
    this.coordinate_Control = new NumericControl(this);
    this.coordinate_Control.real = false;
    this.coordinate_Control.label.text = "Split coordinate:";
    this.coordinate_Control.label.minWidth = labelWidth1;
    this.coordinate_Control.toolTip =
            "<p>Split the image at this x (horizontal split) or y (vertical split) coordinate.</p>";
    this.coordinate_Control.onValueUpdated = function (value) {
        data.coordinate = value;
    };
    let maxRange = 10000;
    if (!data.targetView.isNull){
        if (data.orientation === VERTICAL){
            maxRange = data.targetView.image.height;
        } else {
            maxRange = data.targetView.image.width;
        }
    }
    this.coordinate_Control.setRange(0, maxRange);
    this.coordinate_Control.slider.setRange(0, maxRange);
    this.coordinate_Control.slider.minWidth = 500;
    this.coordinate_Control.setValue(data.coordinate);

    //-------------------------------------------------------
    // Overlap
    //-------------------------------------------------------
    this.overlap_Control = new NumericControl(this);
    this.overlap_Control.real = false;
    this.overlap_Control.label.text = "Overlap:";
    this.overlap_Control.label.minWidth = labelWidth1;
    this.overlap_Control.toolTip = "<p>Amount of overlap between the two new images.</p>" +
            "<p>Each image extends this overlap distance beyond the 'Split Coordinate'.</p>";
    this.overlap_Control.onValueUpdated = function (value) {
        data.overlap = value;
    };
    this.overlap_Control.setRange(0, 400);
    this.overlap_Control.slider.setRange(0, 400);
    this.overlap_Control.slider.minWidth = 400;
    this.overlap_Control.setValue(data.overlap);


    const helpWindowTitle = TITLE + " v" + VERSION;
    const HELP_MSG = "Failed to find help files";

    let buttons_Sizer = createWindowControlButtons(this.dialog, data,
            helpWindowTitle, HELP_MSG, "SplitMosaicTile");

    //-------------------------------------------------------
    // Vertically stack all the objects
    //-------------------------------------------------------
    this.sizer = new VerticalSizer;
    this.sizer.margin = 6;
    this.sizer.spacing = 6;
    this.sizer.add(titleLabel);
    this.sizer.addSpacing(4);
    this.sizer.add(targetImage_Sizer);
    this.sizer.add(orientationSizer);
    this.sizer.add(this.coordinate_Control);
    this.sizer.add(this.overlap_Control);
    this.sizer.add(buttons_Sizer);

    //-------------------------------------------------------
    // Set all the window data
    //-------------------------------------------------------
    this.windowTitle = TITLE;
    this.adjustToContents();
    this.setFixedSize();
}

// Our dialog inherits all properties and methods from the core Dialog object.
}

// Mosaic Linear Fit main process
function main() {
    // Create dialog, start looping
    let data = new SplitData();

    if (Parameters.isViewTarget) {
        // Run the application without the user interface
        console.show();
        data.loadParameters();
        data.targetView = Parameters.targetView;
        if (data.targetView.isPreview){
            data.targetView = data.targetView.window.mainView;
        }
        console.writeln("<b>", TITLE, " ", VERSION, "</b>:");
        splitImage(data);
        return;
    } else if (Parameters.isGlobalTarget) {
        data.loadParameters();
    } else {
        restoreSettings(data);
    }

    let splitDialog = new SplitDialog(data);
    for (; ; ) {
        if (!splitDialog.execute())
            break;
        console.show();
        console.writeln("=================================================");
        console.writeln("<b>", TITLE, " ", VERSION, "</b>:");

        if (data.targetView.isNull) {
            (new MessageBox("WARNING: Target view must be selected", TITLE, StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }

        // User has selected OK. Split the image into two
        data.saveParameters();
        splitImage(data);
        console.hide();
    }
    saveSettings(data);
    return;
}

main();
