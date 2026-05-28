#engine v8

/* global UndoFlag.All, Parameters, View, ImageWindow, Dialog, TextAlignment.Right, TextAlignment.VertCenter, StdIcon.Error, StdButton.Ok, UndoFlag.Keywords, UndoFlag.PixelData, CoreApplication, DataType.Int32, Settings, KEYPREFIX, StdDialogCode.Ok, DataType.Boolean, TRIM_PREVIEW_NAME, UndoFlag.NoSwapFile, DataType.UCString */

"use strict";
#feature-id TrimMosaicTile : Mosaic EGo > TrimMosaicTile

#feature-icon @script_icons_dir/TrimMosaicTile.svg

#feature-info Erodes the non zero area of an image to remove rough edges.<br/>\
Copyright &copy; 2019-2023 John Murphy.<br/>

CoreApplication.ensureMinimumVersion( 1, 9, 4 );


#include "lib/DialogLib.js"
#include "lib/STFAutoStretch.js"
#include "lib/DialogControls.js"
#include "lib/FitsHeader.js"
#include "lib/Geometry.js"
#include "lib/ImageScaleDialog.js"
#include "lib/HelpDialog.js"
#define KEYPREFIX "TrimMosaicTile"
#define TRIM_PREVIEW_NAME "TrimPreview"
function VERSION(){return "4.0.1";}
function TITLE(){return "Trim Mosaic Tile";}
function DEFAULT_TRIM(){return 5;}

/**
 * @param {Image} image
 * @param {Number} x x-coordinate
 * @param {Number} y y-coordinate
 * @return {Boolean} true if the specified pixel has a non zero value in one or more channels
 */
function isNotBlack(image, x, y) {
    if (image.isColor) {
        return (image.sample(x, y, 0) !== 0) || (image.sample(x, y, 1) !== 0) || (image.sample(x, y, 2) !== 0);
    }
    return image.sample(x, y, 0) !== 0;
}

/**
 * Set the specified pixel to zero
 * @param {Image} image
 * @param {Number} x x-coordinate
 * @param {Number} y y-coordinate
 */
function setBlack(image, x, y) {
    image.setSample(0, x, y, 0);
    if (image.isColor) {
        image.setSample(0, x, y, 1);
        image.setSample(0, x, y, 2);
    }
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} row Y coordinate
 * @param {Number} nPixels Number of pixels to trim
 * @return {Boolean} true if the row has image content
 */
function trimRowLeft(image, boundingBox, row, nPixels) {
    const minX = boundingBox.x0;
    const maxX = boundingBox.x1;
    for (let x = minX; x < maxX; x++) {
        if (isNotBlack(image, x, row)) {
            for (let trim = 0; trim < nPixels; trim++) {
                let xCoord = x + trim;
                if (xCoord < maxX) {
                    setBlack(image, xCoord, row);
                } else {
                    break;
                }
            }
            return true;
        }
    }
    return false; // empty row
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} row Y coordinate
 * @param {Number} nPixels Number of pixels to trim
 * @return {Boolean} true if the row has image content
 */
function trimRowRight(image, boundingBox, row, nPixels) {
    const minX = boundingBox.x0;
    const maxX = boundingBox.x1;
    for (let x = maxX - 1; x >= minX; x--) {
        if (isNotBlack(image, x, row)) {
            for (let trim = 0; trim < nPixels; trim++) {
                let xCoord = x - trim;
                if (xCoord > -1) {
                    setBlack(image, xCoord, row);
                } else {
                    break;
                }
            }
            return true;
        }
    }
    return false; // empty row
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} col X coordinate
 * @param {Number} nPixels Number of pixels to trim
 * @return {Boolean} true if the col has image content
 */
function trimColumnTop(image, boundingBox, col, nPixels) {
    const minY = boundingBox.y0;
    const maxY = boundingBox.y1;
    for (let y = minY; y < maxY; y++) {
        if (isNotBlack(image, col, y)) {
            for (let trim = 0; trim < nPixels; trim++) {
                let yCoord = y + trim;
                if (yCoord < maxY) {
                    setBlack(image, col, yCoord);
                } else {
                    break;
                }
            }
            return true;
        }
    }
    return false; // empty col
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} col X coordinate
 * @param {Number} nPixels Number of pixels to trim
 * @return {Boolean} true if the column has image content
 */
function trimColumnBottom(image, boundingBox, col, nPixels) {
    const minY = boundingBox.y0;
    const maxY = boundingBox.y1;
    for (let y = maxY - 1; y >= minY; y--) {
        if (isNotBlack(image, col, y)) {
            for (let trim = 0; trim < nPixels; trim++) {
                let yCoord = y - trim;
                if (yCoord > -1) {
                    setBlack(image, col, yCoord);
                } else {
                    break;
                }
            }
            return true;
        }
    }
    return false; // empty col
}

/**
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} row Y coordinate
 * @return {Boolean} true if the row has image content
 */
function drawLeftOutline(image, boundingBox, row) {
    const minX = boundingBox.x0;
    const maxX = boundingBox.x1;
    for (let x = minX; x < maxX; x++) {
        if (isNotBlack(image, x, row)){
            if (x > 0) {
                image.setSample(1.0, x - 1, row, 0);
            }
            return true;
        }
    }
    return false; // empty row
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} row Y coordinate
 * @return {Boolean} true if the row has image content
 */
function drawRightOutline(image, boundingBox, row) {
    const minX = boundingBox.x0;
    const maxX = boundingBox.x1;
    for (let x = maxX - 1; x >= minX; x--) {
        if (isNotBlack(image, x, row)){
            if (x < image.width - 1) {
                image.setSample(1.0, x + 1, row, 0);
            }
            return true;
        }
    }
    return false; // empty row
}

/**
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} col X coordinate
 * @return {Boolean} true if the col has image content
 */
function drawTopOutline(image, boundingBox, col) {
    const minY = boundingBox.y0;
    const maxY = boundingBox.y1;
    for (let y = minY; y < maxY; y++) {
        if (isNotBlack(image, col, y)){
            if (y > 0) {
                image.setSample(1.0, col, y - 1, 0);
            }
            return true;
        }
    }
    return false; // empty col
}

/** Private function
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} col X coordinate
 * @return {Boolean} true if the column has image content
 */
function drawBottomOutline(image, boundingBox, col) {
    const minY = boundingBox.y0;
    const maxY = boundingBox.y1;
    for (let y = maxY - 1; y >= minY; y--) {
        if (isNotBlack(image, col, y)){
            if (y < image.height - 1) {
                image.setSample(1.0, col, y + 1, 0);
            }
            return true;
        }
    }
    return false; // empty col
}

/**
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} nLeft Number of pixels to remove from left of non zero part of image
 * @param {Number} nRight Number of pixels to remove from right of non zero part of image
 * @param {Boolean} previewOutline
 */
function trimRows(image, boundingBox, nLeft, nRight, previewOutline) {
    if (nLeft === 0 && nRight === 0 && !previewOutline) {
        return; // nothing to trim
    }
    const minRow = boundingBox.y0;
    const maxRow = boundingBox.y1;
    for (let row = minRow; row < maxRow; row++) {
        let rowHasContent = true;
        if (previewOutline){
            rowHasContent = drawLeftOutline(image, boundingBox, row);
        } else if (nLeft > 0) {
            rowHasContent = trimRowLeft(image, boundingBox, row, nLeft);
        }
        if (rowHasContent){
            if (previewOutline){
                drawRightOutline(image, boundingBox, row);
            } else if (nRight > 0) {
                trimRowRight(image, boundingBox, row, nRight);
            }
        }
    }
}

/**
 * @param {Image} image
 * @param {Rect} boundingBox Bounding box of non zero pixels
 * @param {Number} nTop Number of pixels to remove from top of non zero part of image
 * @param {Number} nBottom Number of pixels to remove from bottom of non zero part of image
 * @param {Boolean} previewOutline
 */
function trimColumns(image, boundingBox, nTop, nBottom, previewOutline) {
    if (nTop === 0 && nBottom === 0 && !previewOutline) {
        return; // nothing to trim
    }
    const minCol = boundingBox.x0;
    const maxCol = boundingBox.x1;
    for (let column = minCol; column < maxCol; column++) {
        let colHasContent = true;
        if (previewOutline){
            colHasContent = drawTopOutline(image, boundingBox, column);
        } else if (nTop > 0) {
            colHasContent = trimColumnTop(image, boundingBox, column, nTop);
        }
        if (colHasContent){
            if (previewOutline){
                drawBottomOutline(image, boundingBox, column);
            } else if (nBottom > 0) {
                trimColumnBottom(image, boundingBox, column, nBottom);
            }
        }
    }
}

/**
 * Controller. Processing starts here!
 * @param {TrimImageData} data Values from user interface
 */
function trimImage(data)
{
    let startTime = new Date().getTime();

    // Send our parameters to PixInsight core so that it can be added to the history event
    data.saveParameters();

    // view is set to either the mainView or the real time preview
    let view = data.realTimePreview.isNull ? data.targetView : data.realTimePreview;

    if (view.isMainView){
        console.writeln("Target: ", view.fullId,
            ", Top: ", data.top,
            ", Bottom: ", data.bottom,
            ", Left: ", data.left,
            ", Right: ", data.right);
    }

    if (data.redoImage !== null){
        // Any edit requires us to invalidate the saved undo image
        data.redoImage.free();
        data.redoImage = null;
    }

    // Begin process to let PixInsight know the script is about to modify image data.
    // It will then allow us write access
    if (view.isMainView){
        view.beginProcess(UndoFlag.PixelData | UndoFlag.Keywords);
    } else {
        view.beginProcess(UndoFlag.PixelData);
    }
    let image = view.image;
    let boundingBox;
    let previewOutline;
    if (view.isPreview){
        // The preview always resets back to the targetView, so the bounding box
        // is valid until the targetView is modified or the user changes targetView
        if (data.cachedPreviewBoundingBox === null){
            data.cachedPreviewBoundingBox = getBoundingBox(image);
        }
        boundingBox = data.cachedPreviewBoundingBox;
        previewOutline = data.previewOutline;
    } else {
        data.cachedPreviewBoundingBox = null;
        boundingBox = getBoundingBox(image);
        previewOutline = false;
    }
    trimRows(image, boundingBox, data.left, data.right, previewOutline);
    trimColumns(image, boundingBox, data.top, data.bottom, previewOutline);

    if (view.isMainView){
        let keywords = data.targetView.window.keywords;
        if (data.checkFitsHeaders){
            // Check view contains the header entries that PhotometricMosaic requires
            let pixelSize = getPixelSize(data.targetView, 0);
            let focalLength = getFocalLength(data.targetView, 0);
            if (!pixelSize || !focalLength){
                // The target view is missing one more header entries that PhotometricMosaic requires.
                // Ask the user for the pixel size and focal length
                let imageScaleDialog = new ImageScaleDialog( pixelSize, focalLength, KEYPREFIX, false );
                if (StdDialogCode.Ok === imageScaleDialog.execute()){
                    if (!pixelSize){
                        let pixelSize = imageScaleDialog.getPixelSize();
                        keywords.push(new FITSKeyword("XPIXSZ", (pixelSize).toFixed(2), "Pixel size including binning, X-axis (um)"));
                    }
                    if (!focalLength){
                        let focalLength = imageScaleDialog.getFocalLength();
                        keywords.push(new FITSKeyword("FOCALLEN", (focalLength).toFixed(), "Focal length (mm)"));
                    }
                }
            }
        }
        keywords.push(new FITSKeyword("HISTORY", "", "TrimMosaicTile.target: " + data.targetView.fullId));
        keywords.push(new FITSKeyword("HISTORY", "", "TrimMosaicTile.top: " + data.top));
        keywords.push(new FITSKeyword("HISTORY", "", "TrimMosaicTile.bottom: " + data.bottom));
        keywords.push(new FITSKeyword("HISTORY", "", "TrimMosaicTile.left: " + data.left));
        keywords.push(new FITSKeyword("HISTORY", "", "TrimMosaicTile.right: " + data.right));
        data.targetView.window.keywords = keywords;
    }

    view.endProcess();

    if (view.isMainView){
        console.noteln("\n" + TITLE() + ": Total time ", getElapsedTime(startTime));
    }
}

// -----------------------------------------------------------------------------
// Form/Dialog data
// -----------------------------------------------------------------------------
function TrimImageData() {

    // Used to populate the contents of a saved process icon
    this.saveParameters = function () {
        if (this.targetView.isNull) {
            Parameters.remove("targetView");
        } else {
            Parameters.set("targetView", this.targetView.fullId);
        }
        Parameters.set("checkFitsHeaders", this.checkFitsHeaders);
        Parameters.set("top", this.top);
        Parameters.set("left", this.left);
        Parameters.set("bottom", this.bottom);
        Parameters.set("right", this.right);
    };

    // Reload our script's data from a process icon
    this.loadParameters = function () {
        if (Parameters.has("checkFitsHeaders"))
            this.checkFitsHeaders = Parameters.getBoolean("checkFitsHeaders");
        if (Parameters.has("left"))
            this.left = Parameters.getInteger("left");
        if (Parameters.has("right"))
            this.right = Parameters.getReal("right");
        if (Parameters.has("top"))
            this.top = Parameters.getInteger("top");
        if (Parameters.has("bottom"))
            this.bottom = Parameters.getInteger("bottom");
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
        this.realTimePreview = new View();
        this.checkFitsHeaders = true;
        this.left = DEFAULT_TRIM();
        this.right = DEFAULT_TRIM();
        this.top = DEFAULT_TRIM();
        this.bottom = DEFAULT_TRIM();
        this.cachedPreviewBoundingBox = null;
        if (this.redoImage === undefined){
            this.redoImage = null;
        } else if (this.redoImage !== null){
            // Any edit requires us to invalidate the saved undo image
            this.redoImage.free();
            this.redoImage = null;
        }
        this.previewOutline = false;
    };

    // Used when the user presses the reset button
    this.resetParameters = function (dialog) {
        this.setParameters();
        dialog.checkFitsHeaders_CheckBox.checked = this.checkFitsHeaders;
        dialog.previewGroupBox.checked = !this.realTimePreview.isNull;
        if (!this.targetView.isNull){
            this.targetView.window.currentView = this.targetView;
        }
        dialog.left_Control.setValue(this.left);
        dialog.right_Control.setValue(this.right);
        dialog.top_Control.setValue(this.top);
        dialog.bottom_Control.setValue(this.bottom);
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
    Settings.write( KEYPREFIX+"/checkFitsHeaders", DataType.Boolean, data.checkFitsHeaders );
    Settings.write( KEYPREFIX+"/left", DataType.Int32, data.left );
    Settings.write( KEYPREFIX+"/right", DataType.Int32, data.right );
    Settings.write( KEYPREFIX+"/top", DataType.Int32, data.top );
    Settings.write( KEYPREFIX+"/bottom", DataType.Int32, data.bottom );
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
    keyValue = Settings.read( KEYPREFIX+"/checkFitsHeaders", DataType.Boolean );
    if ( Settings.lastReadOK )
        data.checkFitsHeaders = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/left", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.left = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/right", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.right = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/top", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.top = keyValue;
    keyValue = Settings.read( KEYPREFIX+"/bottom", DataType.Int32 );
    if ( Settings.lastReadOK )
        data.bottom = keyValue;
}

/**
 * Trim Control
 * @param {String} label    trim label (e.g. 'Left:')
 * @param {Number} labelWidth
 * @param {String} tooltip
 * @param {Number} value    initial value
 * @returns {NumericControl}
 */
function createTrimControl(label, labelWidth, tooltip, value) {
    let control = new NumericControl(this);
    control.real = false;
    control.label.text = label;
    control.label.minWidth = labelWidth;
    control.toolTip = tooltip;
    control.setRange(0, 150);
    control.slider.setRange(0, 150);
    control.slider.minWidth = 300;
    control.setValue(value);
    return control;
}

/**
 * If the target view exists and contains a 'TrimPreview' preview, delete the preview.
 * data.realTimePreview is set to a null view.
 * @param {TrimImageData} data
 */
function deleteTrimPreview(data){
    if (!data.targetView.isNull){
        let w = data.targetView.window;
        if (!data.realTimePreview.isNull){
            w.deletePreview(data.realTimePreview);
        } else {
            let preview = previewByIdSafe(w, TRIM_PREVIEW_NAME);
            if (!preview.isNull){
                w.deletePreview(preview);
            }
        }
    }
    data.realTimePreview = new View();
}

// The main dialog function
class trimImageDialog extends Dialog
{
constructor(data)
{
super();

    let self = this;

    // Set some basic widths from dialog text
    let labelWidth1 = this.font.width("Bottom:_");

    // Create the Program Description at the top
    let titleLabel = createTitleLabel("<b>" + TITLE() + " v" + VERSION() +
            "</b> &mdash; Erodes the non zero area of an image back to good data.<br />" +
            "(1) Please read the help section: <i>Quick Start Guide</i>.<br />" +
            "(2) I would be extremely grateful for a coffee <b><u>https://ko-fi.com/jmurphy</u></b> Thanks!<br />" +
            "Copyright &copy; 2019-2023 John Murphy");
    titleLabel.toolTip = "https://ko-fi.com/jmurphy";
    titleLabel.onMousePress = function( x, y, button, buttonState, modifiers ){
        (new HelpDialog()).execute();
    };

    function enableTrimControls(enable){
        self.left_Control.enabled = enable;
        self.top_Control.enabled = enable;
        self.bottom_Control.enabled = enable;
        self.right_Control.enabled = enable;
    }

    function setPreviewOutlineMode(previewOutline){
        previewTrim_radioButton.checked = !previewOutline;
        previewOutline_radioButton.checked = previewOutline;
        data.previewOutline = previewOutline;
        enableTrimControls(!previewOutline);
    }

    // Create the target image field
    let targetImage_Label = new Label(this);
    targetImage_Label.text = "Target view:";
    targetImage_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
    targetImage_Label.minWidth = labelWidth1;

    this.targetImage_ViewList = new ViewList(this);
    this.targetImage_ViewList.getMainViews();
    this.targetImage_ViewList.minWidth = 460;
    this.targetImage_ViewList.currentView = data.targetView;
    this.targetImage_ViewList.toolTip = "<p>Erode the non zero area of this image</p>";
    this.targetImage_ViewList.onViewSelected = (view) => {
        data.cachedPreviewBoundingBox = null;
        if (data.redoImage !== null){
            data.redoImage.free();
            data.redoImage = null;
        }
        deleteTrimPreview(data);    // delete preview from previous targetView
        if (data.originalWindowRect && !data.targetView.isNull){
            data.targetView.window.geometry = data.originalWindowRect;
            data.originalWindowRect = undefined;
        }
        data.targetView = view;
        deleteTrimPreview(data);    // delete preview from current targetView
        setPreviewOutlineMode(false);
        this.previewGroupBox.checked = false;
        this.previewGroupBox.enabled = !view.isNull;
        if (!data.targetView.isNull){
            data.targetView.window.bringToFront();
            data.targetView.window.currentView = data.targetView;
        }
    };

    let targetAutoStf_button = new ToolButton(this);
    targetAutoStf_button.icon = this.scaledResource(":/icons/burn.png");
    targetAutoStf_button.setScaledFixedSize(20, 20);
    targetAutoStf_button.toolTip = "<p>Apply an auto ScreenTransferFunction to the target image.</p>";
    targetAutoStf_button.onClick = function () {
        STFAutoStretch(data.targetView);
        STFAutoStretch(data.realTimePreview);
    };

    let targetImage_Sizer = new HorizontalSizer;
    targetImage_Sizer.spacing = 4;
    targetImage_Sizer.add(targetImage_Label);
    targetImage_Sizer.add(this.targetImage_ViewList, 100);
    targetImage_Sizer.add(targetAutoStf_button);

    this.checkFitsHeaders_CheckBox = new CheckBox(this);
    this.checkFitsHeaders_CheckBox.text = "Check FITS headers for entries required by PhotometricMosaic";
    this.checkFitsHeaders_CheckBox.toolTip = "<p>PhotometricMosaic requires the following FITS headers:</p>" +
        "<p>XPIXSZ (binned pixel size in microns)</p>" +
        "<p>FOCALLEN (focal length in mm).</p>" +
        "<p>If the necessary headers do not exist, a dialog is provided to enter them.</p>";
    this.checkFitsHeaders_CheckBox.checked = data.checkFitsHeaders;
    this.checkFitsHeaders_CheckBox.onClick = function (checked) {
        data.checkFitsHeaders = checked;
    };

    /**
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform the final update.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        if (!data.realTimePreview.isNull){
            // Trim the image.
            trimImage(data);
            self.setUndo();
        }
        CoreApplication.processEvents();
        self.enabled = true;
    }

    // Trim left
    this.left_Control = createTrimControl("Left:", labelWidth1, "<p>Erode pixels on the left of the non zero area.</p>", data.left);
    this.left_Control.onValueUpdated = function (value) {
        data.left = value;
    };
    addFinalUpdateListener(this.left_Control, finalUpdateFunction);

    // Trim right
    this.right_Control = createTrimControl("Right:", labelWidth1, "<p>Erode pixels on the right of the non zero area.</p>", data.right);
    this.right_Control.onValueUpdated = function (value) {
        data.right = value;
    };
    addFinalUpdateListener(this.right_Control, finalUpdateFunction);

    // Trim top
    this.top_Control = createTrimControl("Top:", labelWidth1, "<p>Erode pixels on the top of the non zero area.</p>", data.top);
    this.top_Control.onValueUpdated = function (value) {
        data.top = value;
    };
    addFinalUpdateListener(this.top_Control, finalUpdateFunction);

    // Trim bottom
    this.bottom_Control = createTrimControl("Bottom:", labelWidth1, "<p>Erode pixels on the bottom of the non zero area.</p>", data.bottom);
    this.bottom_Control.onValueUpdated = function (value) {
        data.bottom = value;
    };
    addFinalUpdateListener(this.bottom_Control, finalUpdateFunction);

    let trimGroupBox = new GroupBox(this);
    trimGroupBox.title = "Trim";
    trimGroupBox.sizer = new VerticalSizer;
    trimGroupBox.sizer.margin = 6;
    trimGroupBox.sizer.spacing = 6;
    trimGroupBox.sizer.add(this.top_Control);
    trimGroupBox.sizer.add(this.left_Control);
    trimGroupBox.sizer.add(this.bottom_Control);
    trimGroupBox.sizer.add(this.right_Control);

    let zoom11_Button = new PushButton(this);
    zoom11_Button.icon = this.scaledResource(":/icons/zoom-1-1.png");
    zoom11_Button.toolTip = "Zoom preview to 1:1";
    zoom11_Button.onClick = function (){
        if (!data.targetView.isNull){
            data.targetView.window.zoomFactor = 1;
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        }
    };

    let zoomIn_Button = new PushButton();
    zoomIn_Button.icon = this.scaledResource(":/icons/zoom-in.png");
    zoomIn_Button.toolTip = "<p>Zoom in on preview.</p>";
    zoomIn_Button.onClick = function () {
        zoomIn();
    };

    let zoomOut_Button = new PushButton(this);
    zoomOut_Button.icon = this.scaledResource(":/icons/zoom-out.png");
    zoomOut_Button.toolTip = "<p>Zoom out from preview.</p>";
    zoomOut_Button.onClick = function () {
        zoomOut();
    };

    /**
     * Preview zoom in
     */
    function zoomIn(){
        if (!data.targetView.isNull){
            data.targetView.window.zoomIn();
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        }
    }

    /**
     * Preview zoom out
     */
    function zoomOut(){
        if (!data.targetView.isNull){
            data.targetView.window.zoomOut();
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        }
    }

    let zoomToFit_Button = new PushButton(this);
    zoomToFit_Button.icon = this.scaledResource(":/toolbar/view-zoom-fit.png");
    zoomToFit_Button.text = "Zoom to fit";
    zoomToFit_Button.toolTip = "<p>Zooms the preview to the largest size that will " +
            "fit the desktop, and adjusts the window to fit.</p>";
    zoomToFit_Button.onClick = function () {
        if (!data.targetView.isNull){
            if (!data.originalWindowRect){
                data.originalWindowRect = data.targetView.window.geometry;
            }
            data.targetView.window.zoomToFit();
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        }
    };

    let max_Button = new PushButton(this);
    max_Button.icon = this.scaledResource(":/icons/window.png");
    max_Button.text = "1650 x 1050";
    max_Button.toolTip = "<p>Resize the window to 1650 x 1050</p>";
    max_Button.onClick = function () {
        if (!data.targetView.isNull){
            if (!data.originalWindowRect){
                data.originalWindowRect = data.targetView.window.geometry;
            }
            let w = this.logicalPixelsToPhysical(1650);
            let h = this.logicalPixelsToPhysical(1050);
            data.targetView.window.geometry = new Rect(0, 0, w, h);
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        }
    };

    /**
     * Undo the last preview edit (reset it to the target image).
     * Update the undo/redo button to 'Redo'.
     */
    function undo(){
        if (data.realTimePreview.isNull){
            console.criticalln("Unexpected call to undo...");
            return;
        }
        if (data.redoImage === null){
            data.redoImage = new Image(data.realTimePreview.image);
        }
        data.realTimePreview.beginProcess(UndoFlag.PixelData);
        data.realTimePreview.endProcess();
        self.undoRedoToggle_Button.onClick = redo;
        self.undoRedoToggle_Button.icon = new Bitmap(":/toolbar/preview-redo.png");
        self.undoRedoToggle_Button.text = "Redo";
        self.undoRedoToggle_Button.toolTip = "Redo preview";
    }
    /**
     * Redo the current edit on the preview so that it reflects the trim controls.
     * Update the undo/redo button to 'Undo'.
     */
    function redo(){
        if (data.redoImage !== null){
            data.realTimePreview.beginProcess(UndoFlag.NoSwapFile);
            data.realTimePreview.image.assign(data.redoImage);
            data.realTimePreview.endProcess();
        } else {
            console.criticalln("Unexpected call to redo...");
        }
        self.setUndo();
    }
    /**
     * Set the undo/redo button to 'Undo'
     */
    this.setUndo = function(){
        self.undoRedoToggle_Button.onClick = undo;
        self.undoRedoToggle_Button.icon = this.scaledResource(":/toolbar/preview-undo.png");
        self.undoRedoToggle_Button.text = "Undo";
        self.undoRedoToggle_Button.toolTip = "Undo preview";
    };

    this.undoRedoToggle_Button = new PushButton();
    this.setUndo();

    /**
     * @returns {Number} zoom scale factor (e.g. 0.5, 1, 2)
     */
    function getZoomMultiple(){
        let zoom = data.targetView.window.zoomFactor;
        return zoom < 0 ? -1 / zoom : zoom;
    }

    let previewOutline_radioButton = new RadioButton(this);
    previewOutline_radioButton.text = "Image outline";
    previewOutline_radioButton.toolTip = "<p>Displays the image outline.</p>" +
        "<p>The line should follow the non zero outline of the image. " +
        "Check for gaps between this line and the image.</p>" +
        "<p>Gaps indicate 'almost black' areas. It is essential that these " +
        "areas are removed. Quit this script and use PixelMath to remove them. " +
        "For example, if the 'almost black' area has a peak value of 0.0003, " +
        "the required PixelMath expression is:</p>" +
        "<p>iif($T &lt; 0.0004 ? 0 : $T)</p>";
    previewOutline_radioButton.checked = data.previewOutline;
    previewOutline_radioButton.onClick = function (checked) {
        setPreviewOutlineMode(checked);
        finalUpdateFunction();
    };
    let previewTrim_radioButton = new RadioButton(this);
    previewTrim_radioButton.text = "Preview trimmed image";
    previewTrim_radioButton.toolTip =
        "<p>Adjust the 'Trim' controls until the image is eroded back to good data. " +
        "The image must have a hard edge; " +
        "the background level must transition from 100% to 0% at the image boundary. " +
        "See the 'Quick Start Guide' for more details.</p>" +
        "<p>The preview is updated every time a trim control edit finishes. " +
        "Use Undo / Redo to check the level of erosion.</p>";
    previewTrim_radioButton.checked = !data.previewOutline;
    previewTrim_radioButton.onClick = function (checked) {
        setPreviewOutlineMode(!checked);
        finalUpdateFunction();
    };
    let radio_Sizer = new HorizontalSizer;
    radio_Sizer.spacing = 10;
    radio_Sizer.add(previewOutline_radioButton);
    radio_Sizer.add(previewTrim_radioButton);
    radio_Sizer.addStretch();

    this.scrollX_Control = new NumericControl(this);
    this.scrollX_Control.real = false;
    this.scrollX_Control.label.text = "Scroll X";
    this.scrollX_Control.toolTip = "Scroll the preview horizontally";
    this.scrollX_Control.setRange(0, 100);
    this.scrollX_Control.slider.setRange(0, 100);
    this.scrollX_Control.slider.minWidth = 100;
    this.scrollX_Control.setValue(0);
    this.scrollX_Control.onValueUpdated = function (value) {
        if (!data.realTimePreview.isNull){
            let p = data.targetView.window.viewportPosition;
            data.targetView.window.viewportPosition = new Point(value, p.y);
        }
    };
    /**
     * Sets both the scroll X controls range and its value to the current scroll position
     */
    this.setScrollRangeX = function(){
        if (!data.realTimePreview.isNull){
            let width = Math.ceil(data.realTimePreview.image.width * getZoomMultiple());
            let range = width - data.targetView.window.visibleViewportRect.width;
            self.scrollX_Control.setRange(0, range);
            self.scrollX_Control.slider.setRange(0, range);
            self.setScrollX();
        }
    };
    /**
     * Sets the scroll control's value to the current scroll X position
     */
    this.setScrollX = function(){
        if (!data.realTimePreview.isNull){
            self.scrollX_Control.setValue(data.targetView.window.viewportPosition.x);
        }
    };
    this.setScrollRangeX();

    this.scrollY_Control = new NumericControl(this);
    this.scrollY_Control.real = false;
    this.scrollY_Control.label.text = "Scroll Y";
    this.scrollY_Control.toolTip = "Scroll the preview vertically";
    this.scrollY_Control.setRange(0, 100);
    this.scrollY_Control.slider.setRange(0, 100);
    this.scrollY_Control.slider.minWidth = 100;
    this.scrollY_Control.setValue(0);
    this.scrollY_Control.onValueUpdated = function (value) {
        if (!data.realTimePreview.isNull){
            let p = data.targetView.window.viewportPosition;
            data.targetView.window.viewportPosition = new Point(p.x, value);
        }
    };
    /**
     * Sets both the scroll Y controls range and its value to the current scroll position
     */
    this.setScrollRangeY = function(){
        if (!data.realTimePreview.isNull){
            let height = Math.ceil(data.realTimePreview.image.height * getZoomMultiple());
            let range = height - data.targetView.window.visibleViewportRect.height;
            self.scrollY_Control.setRange(0, range);
            self.scrollY_Control.slider.setRange(0, range);
            self.setScrollY();
        }
    };
    /**
     * Sets the scroll control's value to the current scroll Y position
     */
    this.setScrollY = function(){
        if (!data.realTimePreview.isNull){
            self.scrollY_Control.setValue(data.targetView.window.viewportPosition.y);
        }
    };
    this.setScrollRangeY();

    this.previewGroupBox = new GroupBox(this);
    this.previewGroupBox.title = "Real time preview";
    this.previewGroupBox.titleCheckBox = true;
    this.previewGroupBox.checked = false;
    this.previewGroupBox.sizer = new VerticalSizer;
    this.previewGroupBox.sizer.margin = 6;
    this.previewGroupBox.sizer.spacing = 6;
    this.previewGroupBox.onCheck = function( checked ){
        if (data.targetView.isNull){
            return;
        }
        if (data.redoImage !== null){
            data.redoImage.free();
            data.redoImage = null;
        }
        let w = data.targetView.window;
        setPreviewOutlineMode(checked);
        if (checked) {
            let preview = previewByIdSafe(w, TRIM_PREVIEW_NAME);
            if (preview.isNull){
                data.cachedPreviewBoundingBox = null;
                let previewRect = getBoundingBox(w.mainView.image);
                previewRect.inflateBy(5);
                w.createPreview(previewRect, TRIM_PREVIEW_NAME);
            }
            data.realTimePreview = previewByIdSafe(w, TRIM_PREVIEW_NAME);
            w.currentView = data.realTimePreview;
            finalUpdateFunction();
            self.setUndo();
            CoreApplication.processEvents();
            self.setScrollRangeX();
            self.setScrollRangeY();
        } else {
            data.realTimePreview = new View();
            w.currentView = data.targetView;
        }
    };
    this.previewGroupBox.toolTip =
        "<p>Creates a preview that contains the non zero image area. " +
        "The preview updates as the 'Trim' controls are adjusted.</p>" +
        "<p>Use the Undo / Redo button to check the eroded edges.</p>";

    /**
     * Cancel the 'Real time preview' mode. The current view returns to the
     * main view. Although the preview mode is cancelled, the preview is not
     * deleted.
     * @param {TrimImageData} data
     */
    this.cancelRealTimePreview = function(data){
        self.previewGroupBox.checked = false;
        data.realTimePreview = new View();
        if (!data.targetView.isNull)
            data.targetView.window.currentView = data.targetView;
        setPreviewOutlineMode(false);
    };

    let buttonRow1_Sizer = new HorizontalSizer;
    buttonRow1_Sizer.spacing = 4;
    buttonRow1_Sizer.add(zoomIn_Button);
    buttonRow1_Sizer.add(zoomOut_Button);
    buttonRow1_Sizer.add(zoom11_Button);
    buttonRow1_Sizer.add(zoomToFit_Button);
    buttonRow1_Sizer.add(max_Button);
    buttonRow1_Sizer.add(this.undoRedoToggle_Button);
    buttonRow1_Sizer.addStretch();

    this.previewGroupBox.sizer.add(radio_Sizer);
    this.previewGroupBox.sizer.add(this.scrollX_Control);
    this.previewGroupBox.sizer.add(this.scrollY_Control);
    this.previewGroupBox.sizer.add(buttonRow1_Sizer);

    const helpWindowTitle = TITLE() + " v" + VERSION();
    const HELP_MSG = "<p>Failed to find help.</p>";

    let buttons_Sizer = createWindowControlButtons(this.dialog, data,
            helpWindowTitle, HELP_MSG, "TrimMosaicTile");

    // Vertically stack all the objects
    this.sizer = new VerticalSizer;
    this.sizer.margin = 6;
    this.sizer.spacing = 6;
    this.sizer.add(titleLabel);
    this.sizer.addSpacing(4);
    this.sizer.add(targetImage_Sizer);
    this.sizer.add(this.checkFitsHeaders_CheckBox);
    this.sizer.add(trimGroupBox);
    this.sizer.add(this.previewGroupBox);
    this.sizer.add(buttons_Sizer);

    // Set all the window data
    this.windowTitle = TITLE();
    this.adjustToContents();
    this.setFixedSize();
}

// Our dialog inherits all properties and methods from the core Dialog object.
}

// Trim Image main process
function main() {
    // Create dialog, start looping
    let data = new TrimImageData();

    if (Parameters.isViewTarget) {
        // Perform the script on the target view (no user interface)
        console.show();
        data.loadParameters();
        data.targetView = Parameters.targetView;
        console.writeln("\n<b>", TITLE()," ", VERSION(), "</b>:");
        // Trim the image.
        trimImage(data);
        return;
    } else if (Parameters.isGlobalTarget) {
        data.loadParameters();
    } else {
        restoreSettings(data);
    }

    if (!data.targetView.isNull){
        let w = data.targetView.window;
        w.bringToFront();
        w.currentView = data.targetView;
        deleteTrimPreview(data);
    }

    console.hide();

    let trimDialog = new trimImageDialog(data);
    for (; ; ) {
        if (!trimDialog.execute()){
            // Dialog cancelled. Delete the preview we created.
            deleteTrimPreview(data);
            if (data.redoImage !== null){
                data.redoImage.free();
            }
            if (data.originalWindowRect && !data.targetView.isNull){
                data.targetView.window.geometry = data.originalWindowRect;
            }
            break;
        }

        // User must select a target view
        if (data.targetView.isNull) {
            (new MessageBox("WARNING: Target view must be selected", TITLE(), StdIcon.Error, StdButton.Ok)).execute();
            continue;
        }

        // User has pressed OK.
        // Cancel the 'Real time preview' mode and return to main view, but
        // don't delete the preview.
        console.writeln("\n<b>", TITLE()," ", VERSION(), "</b>:");
        trimDialog.cancelRealTimePreview(data);

        // Trim the image and save Parameters to history.
        trimImage(data);
    }
    saveSettings(data);
    return;
}

main();
