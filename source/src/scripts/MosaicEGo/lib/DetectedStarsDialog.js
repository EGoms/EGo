/* global Dialog, StdCursor.ClosedHand, MouseButton_Left, StdCursor.UpArrow, StdCursor.Checkmark, PhotometryControls, EXTRA_CONTROLS, DEFAULT_STAR_DETECTION */

//"use strict";

/**
 * Display the detected stars in a Dialog that contains a scrolled window.
 * The user can choose to display stars from the reference image or the target image.
 * @param {String} title Window title
 * @param {Bitmap} refBitmap Background image of the reference overlap area at 1:1 scale
 * @param {Bitmap} tgtBitmap Background image of the target overlap area at 1:1 scale
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @returns {DetectedStarsDialog}
 */
class DetectedStarsDialog extends Dialog
{
constructor(title, refBitmap, tgtBitmap, data, photometricMosaicDialog)
{
super();
    
    const REF = 10;
    const TGT = 20;
    let self = this;
    
    let zoomText = "1:1";
    let coordText;
    setCoordText(null);
    let selectedBitmap = REF;
    let bitmapOffset = getBitmapOffset(data);
    let bitmap = getBitmap(selectedBitmap);
    let stars = getStars(selectedBitmap);
    
    /**
     * Return bitmap of the reference or target image
     * @param {Number} refOrTgt Set to REF or TGT
     * @returns {Bitmap}
     */
    function getBitmap(refOrTgt){
        return refOrTgt === REF ? refBitmap : tgtBitmap;
    }
    
    /**
     * Display the stars detected in the reference (refOrTgt = REF) or target image.
     * @param {NUMBER} refOrTgt Set to REF or TGT
     * @returns {Star[]}
     */
    function getStars(refOrTgt){
        let detectedRawStars;
        if (refOrTgt === REF){
            detectedRawStars = data.cache.getDetectedRefStars();
        } else {
            detectedRawStars = data.cache.getDetectedTgtStars();
        }
        return detectedRawStars.getStars();
    }
    
    /**
     * The offset between the full mosaic image and the bounding box of the overlap area.
     * Note that bitmap is of the overlap area.
     * @param {PhotometricMosaicData} data
     * @returns {Point} bitmap offset
     */
    function getBitmapOffset(data){
        let overlapBox = data.cache.overlap.overlapBox;
        return new Point(overlapBox.x0, overlapBox.y0);
    }
    
    /**
     * Set dialog title, including the current zoom and cursor coordinates
     */
    function setTitle(){
        self.windowTitle = title + " " + zoomText + " " + coordText;
    };
    
    /**
     * Set coordText, the cursor coordinate text. The coordText
     * is relative to the full mosaic image's top left corner.
     * @param {Point} point cursor coordinates relative to the (1:1) bitmap
     */
    function setCoordText(point){
        if (point === null){
            coordText = "(---,---)";
        } else {
            let x = bitmapOffset.x + point.x;
            let y = bitmapOffset.y + point.y;
            coordText = format("(%8.2f,%8.2f )", x, y);
        }
    }
    
    /**
     * Draw on top of the background bitmap, within the scrolled window
     * @param {Control} viewport
     * @param {Number} translateX
     * @param {Number} translateY
     * @param {Number} scale
     * @param {Number} x0
     * @param {Number} y0
     * @param {Number} x1
     * @param {Number} y1
     */
    function drawDetectedStars(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.pen = new Pen(0xffff0000, 1.0);
            graphics.antialiasing = true;
            for (let i = 0; i < stars.length; ++i){
                let star = stars[i];
                if (star.insideOverlap){
                    let radius = star.getStarRadius();
                    let x = star.pos.x - bitmapOffset.x;
                    let y = star.pos.y - bitmapOffset.y;
                    graphics.strokeCircle(x, y, radius);
                }
            }
            graphics.antialiasing = false;
            graphics.pen = new Pen(0xff000000, 0);
            data.cache.overlap.drawOverlapOutline(graphics, bitmapOffset.x, bitmapOffset.y);
        } catch (e){
            console.criticalln("drawDetectedStars error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    // =================================
    // Sample Generation Preview frame
    // =================================
    let previewWidth = 1800;
    let previewHeight = 950;
    if (data.smallScreen){
        previewHeight -= 300;
    }
    let previewControl = new PreviewControl(this, bitmap, previewWidth, previewHeight, null, null, false);
    previewControl.updateZoomText = function (text){
        zoomText = text;
        setTitle();
    };
    previewControl.updateCoord = function (point){
        setCoordText(point);
        setTitle();
    };
    previewControl.onCustomPaintScope = this;
    previewControl.onCustomPaint = function (viewport, translateX, translateY, scale, x0, y0, x1, y1){
        drawDetectedStars(viewport, translateX, translateY, scale, x0, y0, x1, y1);
    };
    previewControl.ok_Button.onClick = function(){
        self.ok();
    };

    previewControl.setMinHeight(200);
    // ========================================
    // User controls
    // ========================================
    let controlsHeight = 0;
    let minHeight = previewControl.minHeight;
    
    this.onToggleSection = function(bar, beginToggle){
        if (beginToggle){
            if (bar.isExpanded()){
                previewControl.setMinHeight(previewControl.height + bar.section.height + 2);
            } else {
                previewControl.setMinHeight(previewControl.height - bar.section.height - 2);
            }
        } else {
            previewControl.setMinHeight(minHeight);
        }
    };
    
    let refCheckBox = new CheckBox(this);
    refCheckBox.text = "Reference";
    refCheckBox.toolTip = "Display either reference or target stars within the overlap region.";
    refCheckBox.checked = true;
    refCheckBox.onClick = function (checked) {
        self.enabled = false;
        CoreApplication.processEvents();
        selectedBitmap = checked ? REF : TGT;
        bitmap = getBitmap(selectedBitmap);
        stars = getStars(selectedBitmap);
        previewControl.updateBitmap(bitmap);
        previewControl.forceRedraw();
        self.enabled = true;
    };
    
    /**
     * When a slider is dragged, only fast draw operations are performed.
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform all calculations.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        data.cache.updateStarDetection(data.refLogStarDetection, data.tgtLogStarDetection);
        stars = getStars(selectedBitmap);
        previewControl.forceRedraw();
        self.enabled = true;
    }
    
    // ===================================================
    // SectionBar: Star aperture size
    // ===================================================
    let starDetectionControls = new StarDetectionControls();
    let strLen = this.font.width("Reference star detection:");
    
    let refDetection_Control = starDetectionControls.createRefLogStarDetect_Control(this, data, strLen);
    refDetection_Control.onValueUpdated = function (value) {
        data.refLogStarDetection = value;
        photometricMosaicDialog.refLogStarDetection_Control.setValue(value);
    };
    addFinalUpdateListener(refDetection_Control, finalUpdateFunction);
    controlsHeight += refDetection_Control.height;
    
    let refDetectionReset_Control = starDetectionControls.createStarDetectResetControl(this);
    refDetectionReset_Control.onClick = function(){
        data.refLogStarDetection = DEFAULT_STAR_DETECTION;
        refDetection_Control.setValue(data.refLogStarDetection);
        photometricMosaicDialog.refLogStarDetection_Control.setValue(data.refLogStarDetection);
        finalUpdateFunction();
    };
    let refHorizontalSizer = new HorizontalSizer;
    refHorizontalSizer.spacing = 4;
    refHorizontalSizer.add(refDetection_Control, 100);
    refHorizontalSizer.add(refDetectionReset_Control, 0);
    refHorizontalSizer.addStretch();
    
    let tgtDetection_Control = starDetectionControls.createTgtLogStarDetect_Control(
            this, data, strLen);
    tgtDetection_Control.onValueUpdated = function (value) {
        data.tgtLogStarDetection = value;
        photometricMosaicDialog.tgtLogStarDetection_Control.setValue(value);
    };
    addFinalUpdateListener(tgtDetection_Control, finalUpdateFunction);
    controlsHeight += tgtDetection_Control.height;
    
    let tgtDetectionReset_Control = starDetectionControls.createStarDetectResetControl(this);
    tgtDetectionReset_Control.onClick = function(){
        data.tgtLogStarDetection = DEFAULT_STAR_DETECTION;
        tgtDetection_Control.setValue(data.tgtLogStarDetection);
        photometricMosaicDialog.tgtLogStarDetection_Control.setValue(data.tgtLogStarDetection);
        finalUpdateFunction();
    };
    let tgtHorizontalSizer = new HorizontalSizer;
    tgtHorizontalSizer.spacing = 4;
    tgtHorizontalSizer.add(tgtDetection_Control, 100);
    tgtHorizontalSizer.add(tgtDetectionReset_Control, 0);
    tgtHorizontalSizer.addStretch();
    
    let logDetectionSection = new Control(this);
    logDetectionSection.sizer = new VerticalSizer;
    logDetectionSection.sizer.spacing = 2;
    logDetectionSection.sizer.add(refHorizontalSizer);
    logDetectionSection.sizer.add(tgtHorizontalSizer);
    let logDetectionBar = new SectionBar(this, "Star Detection");
    logDetectionBar.setSection(logDetectionSection);
    logDetectionBar.onToggleSection = this.onToggleSection;
    logDetectionBar.toolTip = "Specifies the star detection sensitivity";
    controlsHeight += logDetectionBar.height + logDetectionSection.sizer.spacing * 3;

    let optionsSizer = new HorizontalSizer(this);
    optionsSizer.margin = 0;
    optionsSizer.spacing = 10;
    optionsSizer.addSpacing(4);
    optionsSizer.add(refCheckBox);
    optionsSizer.addStretch();
    
    controlsHeight += refCheckBox.height;
    
    // Global sizer
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 2;
    this.sizer.spacing = 2;
    this.sizer.add(previewControl);
    this.sizer.add(optionsSizer);
    this.sizer.add(logDetectionBar);
    this.sizer.add(logDetectionSection);
    this.sizer.add(previewControl.getButtonSizer());
    
    controlsHeight += this.sizer.margin * 2 + this.sizer.spacing * 4;

    // The PreviewControl size is determined by the size of the bitmap
    this.userResizable = true;
    let preferredWidth = previewControl.width + this.sizer.margin * 2 + this.logicalPixelsToPhysical(20);
    let preferredHeight = previewControl.height + previewControl.getButtonSizerHeight() +
            controlsHeight + this.logicalPixelsToPhysical(20);
    this.resize(preferredWidth, preferredHeight);
    setTitle();
}

}
