/* global Dialog, StdCursor.ClosedHand, MouseButton_Left, StdCursor.UpArrow, StdCursor.Checkmark, PhotometryControls, EXTRA_CONTROLS */


//"use strict";

/**
 * Display the detected stars in a Dialog that contains a scrolled window.
 * The user can choose to display stars from the reference image or the target image.
 * @param {String} title Window title
 * @param {Bitmap} refBitmap Background image of the reference overlap area at 1:1 scale
 * @param {Bitmap} tgtBitmap Background image of the target overlap area at 1:1 scale
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @returns {PhotometryStarsDialog}
 */
class PhotometryStarsDialog extends Dialog
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
    let selectedChannel = 3;    // 0=R, 1=G, 2=B, 3 = all
    let bitmapOffset = getBitmapOffset(data);
    let bitmap = getBitmap(selectedBitmap);
    let stars = getStars(selectedBitmap);
    let nChannels = data.cache.isColor() ? 3 : 1;
    let colorStarPairs = getColorStarPairs(nChannels, data);
    let starPairs = getStarPairs(selectedChannel);
    
    let drawOrigPhotRects = false;
    
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
     * The displayed stars can be limited to a single color channel.
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
     * @param {Number} channel
     * @returns {StarPair[]}
     */
    function getStarPairs(channel){
        starPairs = [];
        if (data.cache.isColor()){
            if (channel < 3){
                // return stars from channel 0, 1 or 2
                starPairs = colorStarPairs[channel];
            } else {
                // return stars in all channels
                starPairs = colorStarPairs[0].concat(colorStarPairs[1], colorStarPairs[2]);
            }
        } else {
            starPairs = colorStarPairs[0];
        }
        return starPairs;
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
        } catch (e){
            console.criticalln("drawDetectedStars error: " + e);
        } finally {
            graphics.end();
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
    function drawPhotometryStars(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.pen = new Pen(0xffff0000);
            // Draw inner star flux square and outer background sky flux square
            for (let i = 0; i < starPairs.length; ++i){
                let starPair = starPairs[i];
                let pmStar = selectedBitmap === REF ? starPair.refPmStar : starPair.tgtPmStar;
                let rect;
                if (drawOrigPhotRects){
                    rect = new Rect(pmStar.getStar().getBoundingBox());
                } else {
                    rect = pmStar.getStarAperture();
                }
                rect.moveBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.strokeRect(rect);
                let bgInnerRect = pmStar.getStarBgAperture1();
                bgInnerRect.moveBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.strokeRect(bgInnerRect);
                let bgOuterRect = pmStar.getStarBgAperture2();
                bgOuterRect.moveBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.strokeRect(bgOuterRect);
            }
        } catch(e) {
            console.criticalln("drawPhotometryStars error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    // =================================
    // Sample Generation Preview frame
    // =================================
    let previewWidth = 1800;
    let previewHeight = 830;
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
        // Draw overlap outline
        let graphics = new Graphics(viewport);
        graphics.clipRect = new Rect(x0, y0, x1, y1);
        graphics.translateTransformation(translateX, translateY);
        graphics.scaleTransformation(scale, scale);
        graphics.antialiasing = false;
        graphics.pen = new Pen(0xff000000, 0);
        data.cache.overlap.drawOverlapOutline(graphics, bitmapOffset.x, bitmapOffset.y);
        graphics.end();
        
        if (photometricCheckBox.checked){
            drawPhotometryStars(viewport, translateX, translateY, scale, x0, y0, x1, y1);
        } else {
            drawDetectedStars(viewport, translateX, translateY, scale, x0, y0, x1, y1);
        }
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
        selectedBitmap = checked ? REF : TGT;
        bitmap = getBitmap(selectedBitmap);
        stars = getStars(selectedBitmap);
        starPairs = getStarPairs(selectedChannel);
        previewControl.updateBitmap(bitmap);
        update();
    };
    
    let photometricCheckBox = new CheckBox(this);
    photometricCheckBox.text = "Photometry";
    photometricCheckBox.toolTip = "<p>Display either the detected stars (circles) " +
            "or the stars used for photometry (square aperture rings).</p>";
    photometricCheckBox.checked = true;
    photometricCheckBox.onClick = function (checked) {
        enableControls(data.useAutoPhotometry, checked);
        starPairs = getStarPairs(selectedChannel);
        previewControl.updateBitmap(bitmap);
        update();
    };
    
    let oldPhotometricCheckBox;
    if (EXTRA_CONTROLS){
        oldPhotometricCheckBox = new CheckBox(this);
        oldPhotometricCheckBox.text = "Unmodified";
        oldPhotometricCheckBox.toolTip = "<p>Use photometry rectangles from StarDetector.</p>";
        oldPhotometricCheckBox.checked = drawOrigPhotRects;
        oldPhotometricCheckBox.onClick = function (checked) {
            drawOrigPhotRects = checked;
            starPairs = getStarPairs(selectedChannel);
            previewControl.updateBitmap(bitmap);
            update();
        };
    }
    
    let redRadioButton = new RadioButton(this);
    redRadioButton.text = "Red";
    redRadioButton.toolTip = "<p>Display the stars detected within the red channel</p>" +
            "<p>This is only used to declutter the display. " +
            "The settings will be applied to all color channels.</p>";
    redRadioButton.checked = false;
    redRadioButton.onClick = function (checked) {
        selectedChannel = 0;
        stars = getStars(selectedBitmap);
        starPairs = getStarPairs(selectedChannel);
        update();
    };
    
    let greenRadioButton = new RadioButton(this);
    greenRadioButton.text = "Green";
    greenRadioButton.toolTip = "<p>Display the stars detected within the green channel</p>" +
            "<p>This is only used to declutter the display. " +
            "The settings will be applied to all color channels.</p>";
    greenRadioButton.checked = false;
    greenRadioButton.onClick = function (checked) {
        selectedChannel = 1;
        stars = getStars(selectedBitmap);
        starPairs = getStarPairs(selectedChannel);
        update();
    };
    
    let blueRadioButton = new RadioButton(this);
    blueRadioButton.text = "Blue";
    blueRadioButton.toolTip = "<p>Display the stars detected within the blue channel</p>" +
            "<p>This is only used to declutter the display. " +
            "The settings will be applied to all color channels.</p>";
    blueRadioButton.checked = false;
    blueRadioButton.onClick = function (checked) {
        selectedChannel = 2;
        stars = getStars(selectedBitmap);
        starPairs = getStarPairs(selectedChannel);
        update();
    };
    
    let allRadioButton = new RadioButton(this);
    allRadioButton.text = "All";
    allRadioButton.toolTip = "Display the stars detected within all channels";
    allRadioButton.checked = true;
    allRadioButton.onClick = function (checked) {
        selectedChannel = 3;
        stars = getStars(selectedBitmap);
        starPairs = getStarPairs(selectedChannel);
        update();
    };
    
    if (!data.cache.isColor()){
        redRadioButton.enabled = false;
        greenRadioButton.enabled = false;
        blueRadioButton.enabled = false;
    }
    
    /**
     * When a slider is dragged, only fast draw operations are performed.
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform all calculations.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        updatePhotometry();
        self.enabled = true;
    }
    
    // ===================================================
    // SectionBar: Star aperture size
    // ===================================================
    let photometryControls = new PhotometryControls();
    let strLen = this.font.width("Outlier removal %:");
    
    let apertureGrowthRate_Control = photometryControls.createApertureGrowthRateControl(
            this, data, strLen);
    apertureGrowthRate_Control.onValueUpdated = function (value) {
        data.apertureGrowthRate = value;
        photometricMosaicDialog.apertureGrowthRate_Control.setValue(value);
        update();
        CoreApplication.processEvents();
    };
    addFinalUpdateListener(apertureGrowthRate_Control, finalUpdateFunction);
    controlsHeight += apertureGrowthRate_Control.height;
    
    let apertureAdd_Control = photometryControls.createApertureAddControl(this, data, strLen);
    apertureAdd_Control.onValueUpdated = function (value) {
        data.apertureAdd = value;
        photometricMosaicDialog.apertureAdd_Control.setValue(value);
        update();
        CoreApplication.processEvents();
    };
    addFinalUpdateListener(apertureAdd_Control, finalUpdateFunction);
    controlsHeight += apertureAdd_Control.height;
    
    let apertureGap_Control = photometryControls.createApertureGapControl(this, data, strLen);
    apertureGap_Control.onValueUpdated = function (value) {
        data.apertureGap = value;
        photometricMosaicDialog.apertureGap_Control.setValue(value);
        update();
        CoreApplication.processEvents();
    };
    addFinalUpdateListener(apertureGap_Control, finalUpdateFunction);
    controlsHeight += apertureGap_Control.height;
    
    let apertureBgDelta_Control = photometryControls.createApertureBgDeltaControl(
            this, data, strLen);
    apertureBgDelta_Control.onValueUpdated = function (value) {
        data.apertureBgDelta = value;
        photometricMosaicDialog.apertureBgDelta_Control.setValue(value);
        update();
        CoreApplication.processEvents();
    };
    addFinalUpdateListener(apertureBgDelta_Control, finalUpdateFunction);
    controlsHeight += apertureBgDelta_Control.height;
    
    let apertureSection = new Control(this);
    apertureSection.sizer = new VerticalSizer;
    apertureSection.sizer.spacing = 2;
    apertureSection.sizer.add(apertureAdd_Control);
    apertureSection.sizer.add(apertureGrowthRate_Control);
    apertureSection.sizer.add(apertureGap_Control);
    apertureSection.sizer.add(apertureBgDelta_Control);
    let apertureBar = new SectionBar(this, "Star Aperture Size");
    apertureBar.setSection(apertureSection);
    apertureBar.onToggleSection = this.onToggleSection;
    apertureBar.toolTip = "Specifies the photometry star aperture";
    controlsHeight += apertureBar.height + apertureSection.sizer.spacing * 3;
    
    // ===================================================
    // SectionBar: Star filters
    // ===================================================
    let limitPhotoStarsPercent_Control = photometryControls.createLimitPhotoStarsPercentControl(
            this, data, strLen);
    limitPhotoStarsPercent_Control.onValueUpdated = function (value) {
        data.limitPhotoStarsPercent = value;
        photometricMosaicDialog.limitPhotoStarsPercent_Control.setValue(value);
    };
    addFinalUpdateListener(limitPhotoStarsPercent_Control, finalUpdateFunction);
//    controlsHeight += limitPhotoStarsPercent_Control.height;
    
    let outlierRemoval_Control = photometryControls.createOutlierRemovalControl(
            this, data, strLen);
    outlierRemoval_Control.onValueUpdated = function (value) {
        data.outlierRemovalPercent = value;
        photometricMosaicDialog.outlierRemoval_Control.setValue(value);
    };
    addFinalUpdateListener(outlierRemoval_Control, finalUpdateFunction);
//    controlsHeight += outlierRemoval_Control.height;
    
    let filterSection = new Control(this);
    filterSection.sizer = new VerticalSizer;
    filterSection.sizer.spacing = 2;
    filterSection.sizer.add(limitPhotoStarsPercent_Control);
    filterSection.sizer.add(outlierRemoval_Control);
    filterSection.sizer.addSpacing(5);
    let filterBar = new SectionBar(this, "Filter Photometry Stars");
    filterBar.setSection(filterSection);
    filterBar.onToggleSection = this.onToggleSection;
    filterBar.toolTip = "Specifies which stars are used for photometry";
    controlsHeight += filterBar.height + filterSection.sizer.spacing * 2 + 5;
    
    // ===================================================
    // SectionBar: Linear Range
    // ===================================================
    const REFERENCE_STRLEN = this.font.width("Reference:");
    let linearRangeRef_Control = photometryControls.createLinearRangeRefControl(
            this, data, REFERENCE_STRLEN);
    linearRangeRef_Control.onValueUpdated = function (value) {
        data.linearRangeRef = value;
        photometricMosaicDialog.linearRangeRef_Control.setValue(value);
//        if (liveUpdate_control.checked){
//            update(bitmapControl.width, bitmapControl.height, true);
//        }
    };
    addFinalUpdateListener(linearRangeRef_Control, finalUpdateFunction);
//    controlsHeight += linearRangeRef_Control.height;
    
    let linearRangeTgt_Control = photometryControls.createLinearRangeTgtControl(
            this, data, REFERENCE_STRLEN);
    linearRangeTgt_Control.onValueUpdated = function (value) {
        data.linearRangeTgt = value;
        photometricMosaicDialog.linearRangeTgt_Control.setValue(value);
//        if (liveUpdate_control.checked){
//            update(bitmapControl.width, bitmapControl.height, true);
//        }
    };
    addFinalUpdateListener(linearRangeTgt_Control, finalUpdateFunction);
//    controlsHeight += linearRangeRef_Control.height;
    
    let linearRangeSection = new Control(this);
    linearRangeSection.sizer = new VerticalSizer;
    linearRangeSection.sizer.spacing = 2;
    linearRangeSection.sizer.add(linearRangeRef_Control);
    linearRangeSection.sizer.add(linearRangeTgt_Control);
    linearRangeSection.sizer.addSpacing(5);
    let linearRangeBar = new SectionBar(this, "Linear Range");
    linearRangeBar.setSection(linearRangeSection);
    linearRangeBar.onToggleSection = this.onToggleSection;
    linearRangeBar.toolTip = "Only stars within the camera's linear range should be used for photometry";
    controlsHeight += linearRangeBar.height + linearRangeSection.sizer.spacing + 5;

    /**
     * Draw the stars on top of the background bitmap within the scrolled window.
     */
    function update(){
        previewControl.forceRedraw();
    }
    
    function updatePhotometry(){
        colorStarPairs = getColorStarPairs(nChannels, data);
        starPairs = getStarPairs(selectedChannel);
        update();
    }
    
    let autoCheckBox = new CheckBox(this);
    autoCheckBox.text = "Auto";
    autoCheckBox.toolTip = "<p>Automatically sets the following controls:</p>" +
            "<ul><li><b>Radius add</b></li>" +
            "<li><b>Growth rate</b></li>" +
            "<li><b>Background delta</b></li>" +
            "<li><b>Limit stars %</b></li>" +
            "</ul>";
    autoCheckBox.onClick = function (checked) {
        photometricMosaicDialog.setPhotometryAutoValues(checked);
        if (checked){
            self.enabled = false;
            apertureAdd_Control.setValue(data.apertureAdd);
            apertureGrowthRate_Control.setValue(data.apertureGrowthRate);
            apertureGap_Control.setValue(data.apertureGap);
            apertureBgDelta_Control.setValue(data.apertureBgDelta);
            limitPhotoStarsPercent_Control.setValue(data.limitPhotoStarsPercent);
            outlierRemoval_Control.setValue(data.outlierRemovalPercent);
            linearRangeRef_Control.setValue(data.linearRangeRef);
            linearRangeTgt_Control.setValue(data.linearRangeTgt);
            CoreApplication.processEvents();
            finalUpdateFunction();
            self.enabled = true;
        }
        enableControls(checked, photometricCheckBox.checked);
    };
    autoCheckBox.checked = data.useAutoPhotometry;
    
    function enableControls(auto, isPhotometricMode){
        apertureAdd_Control.enabled = !auto && isPhotometricMode;
        apertureGrowthRate_Control.enabled = !auto && isPhotometricMode;
        apertureGap_Control.enabled = !auto && isPhotometricMode;
        apertureBgDelta_Control.enabled = !auto && isPhotometricMode;
        limitPhotoStarsPercent_Control.enabled = !auto && isPhotometricMode;
        linearRangeRef_Control.enabled = !auto && isPhotometricMode;
        linearRangeTgt_Control.enabled = !auto && isPhotometricMode;
        outlierRemoval_Control.enabled = !auto && isPhotometricMode;
    }
    
    enableControls(data.useAutoPhotometry, true);

    let optionsSizer = new HorizontalSizer(this);
    optionsSizer.margin = 0;
    optionsSizer.spacing = 10;
    optionsSizer.addSpacing(4);
    optionsSizer.add(autoCheckBox);
    optionsSizer.add(photometricCheckBox);
    optionsSizer.add(refCheckBox);
    optionsSizer.addSpacing(10);
    optionsSizer.add(redRadioButton);
    optionsSizer.add(greenRadioButton);
    optionsSizer.add(blueRadioButton);
    optionsSizer.add(allRadioButton);
    optionsSizer.addStretch();
    if (EXTRA_CONTROLS)
        optionsSizer.add(oldPhotometricCheckBox);
    
    controlsHeight += refCheckBox.height;
    
    // Global sizer
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 2;
    this.sizer.spacing = 2;
    this.sizer.add(previewControl);
    this.sizer.add(optionsSizer);
    this.sizer.add(apertureBar);
    this.sizer.add(apertureSection);
    this.sizer.add(filterBar);
    this.sizer.add(filterSection);
    this.sizer.add(linearRangeBar);
    this.sizer.add(linearRangeSection);
    this.sizer.add(previewControl.getButtonSizer());
    
    controlsHeight += this.sizer.margin * 2 + this.sizer.spacing * 4;
    filterSection.hide();
    linearRangeSection.hide();

    // The PreviewControl size is determined by the size of the bitmap
    this.userResizable = true;
    let preferredWidth = previewControl.width + this.sizer.margin * 2 + this.logicalPixelsToPhysical(20);
    let preferredHeight = previewControl.height + previewControl.getButtonSizerHeight() +
            controlsHeight + this.logicalPixelsToPhysical(20);
    this.resize(preferredWidth, preferredHeight);
    setTitle();
}

}
