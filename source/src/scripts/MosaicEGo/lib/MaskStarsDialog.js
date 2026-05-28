/* global Dialog, StdCursor.ClosedHand, MouseButton_Left, StdCursor.UpArrow, StdCursor.Checkmark, APERTURE_GROWTH */

//"use strict";

/**
 * Display the Mask Stars in a Dialog that contains a scrolled window and 
 * controls to adjust the Mask Star parameters.
 * @param {Rect} joinArea 
 * @param {PhotometricMosaicData} data Values from user interface
 * @returns {MaskStarsDialog}
 */
class MaskStarsDialog extends Dialog
{
constructor(joinArea, data)
{
super();
    
    const REF = 10;
    const TGT = 20;
    let self = this;
    
    let tgtView = data.targetView;
    
    let zoomText = "1:1";
    let coordText;
    setCoordText(null);
    let selectedBitmap = REF;
    
    let overlap = data.cache.overlap;
    let refBitmap = overlap.refBitmap;
    let tgtBitmap = overlap.tgtBitmap;
    
    let bitmapOffset = getBitmapOffset(data);
    let bitmap = getBitmap(selectedBitmap);
    let clipRect = getClipRect();
    
    /**
     * Create a clipRect based on the joinArea.
     * This is used to limit the star drawing to the join area.
     * @returns {Rect}
     */
    function getClipRect(){
        let x0 = joinArea.x0 - bitmapOffset.x;
        let y0 = joinArea.y0 - bitmapOffset.y;
        let x1 = joinArea.x1 - bitmapOffset.x;
        let y1 = joinArea.y1 - bitmapOffset.y;
        return new Rect(x0, y0, x1, y1);
    }
    
    /**
     * Return bitmap of the reference or target image
     * @param {Number} refOrTgt Set to REF or TGT
     * @returns {Bitmap}
     */
    function getBitmap(refOrTgt){
        return refOrTgt === REF ? refBitmap : tgtBitmap;
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
        self.windowTitle = "Create Star Mask " + zoomText + " " + coordText;
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
    function drawMaskStars(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.pen = new Pen(0xffff0000);
            graphics.drawRect(clipRect);
            graphics.pen = new Pen(0xffff0000, 1.5);
            graphics.antialiasing = true;
            graphics.clipRect = clipRect;
            let allStars = data.cache.getAllDetectedStars();
            let firstNstars;
            if (data.limitMaskStarsPercent < 100){
                firstNstars = Math.floor(allStars.length * data.limitMaskStarsPercent / 100);
            } else {
                firstNstars = allStars.length;
            }

            for (let i = 0; i < firstNstars; ++i){
                let star = allStars[i];
                let x = star.pos.x - bitmapOffset.x;
                let y = star.pos.y - bitmapOffset.y;
                let starRadius = calcStarMaskRadius(star, data);
                graphics.strokeCircle(x, y, starRadius);
            }
            
            for (let i = 0; i < data.manualRejectionCircles.length; ++i){
                let circle = data.manualRejectionCircles[i];
                let x = circle.x - bitmapOffset.x;
                let y = circle.y - bitmapOffset.y;
                let radius = circle.overlapRadius + data.maskStarRadiusAdd;
                graphics.strokeCircle(x, y, radius);
            }
            
        } catch (e) {
            console.criticalln("drawMaskStars error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    // =================================
    // Sample Generation Preview frame
    // =================================
    let previewWidth = 1800;
    let previewHeight = 885;
    if (data.smallScreen){
        previewHeight -= 300;
    }
    let previewControl = new PreviewControl(this, bitmap, previewWidth, previewHeight, null, null, true);
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
        drawMaskStars(viewport, translateX, translateY, scale, x0, y0, x1, y1);
    };

    previewControl.ok_Button.text = "Run";
    previewControl.ok_Button.icon = this.scaledResource( ":/icons/power.png" );
    previewControl.ok_Button.toolTip = "<p>Creates a new mask image.</p>" + 
            "<p>The dialog remains open so that a number of mask images can be " +
            "created. It is often useful to generate masks with a " +
            "small, medium and large number of stars. " +
            "Try each mask and compare the results.</p>";
    previewControl.ok_Button.onClick = function(){
        console.writeln("\n<b><u>Creating mosaic mask</u></b>");
        self.enabled = false;
        CoreApplication.processEvents();
        createStarMask(tgtView, joinArea, data);    
        self.enabled = true;
    };
    
    previewControl.cancel_Button.text = "Close";
    previewControl.cancel_Button.toolTip = "<p>Close dialog</p>";
    previewControl.cancel_Button.onClick = function(){
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
    refCheckBox.toolTip = "Display reference or target image.";
    refCheckBox.checked = true;
    refCheckBox.onClick = function (checked) {
        self.enabled = false;
        CoreApplication.processEvents();
        selectedBitmap = checked ? REF : TGT;
        bitmap = getBitmap(selectedBitmap);
        previewControl.updateBitmap(bitmap);
        update();
        self.enabled = true;
    };


    /**
     * When a slider is dragged, only fast draw operations are performed.
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform the final update.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        self.enabled = true;
    }
    
    // ===================================================
    // SectionBar: Star size
    // ===================================================
    let starMaskLabelSize = this.font.width("Limit stars %:");
    let maskStarGrowthRate_Control = new NumericControl(this);
    maskStarGrowthRate_Control.real = true;
    maskStarGrowthRate_Control.label.text = "Growth rate:";
    maskStarGrowthRate_Control.toolTip =
            "<p>Determines the radius for bright stars.</p>" +
            "<p>Use this control to increase the size of bright stars " +
            "(use 'Radius add' for faint stars).</p>";
    maskStarGrowthRate_Control.label.setFixedWidth(starMaskLabelSize);
    maskStarGrowthRate_Control.setRange(0, 3);
    maskStarGrowthRate_Control.slider.setRange(0, 600);
    maskStarGrowthRate_Control.setPrecision(3);
    maskStarGrowthRate_Control.maxWidth = 800;
    maskStarGrowthRate_Control.setValue(data.maskStarGrowthRate);
    maskStarGrowthRate_Control.onValueUpdated = function (value) {
        data.maskStarGrowthRate = value;
        update();
    };
    addFinalUpdateListener(maskStarGrowthRate_Control, finalUpdateFunction);
    controlsHeight += maskStarGrowthRate_Control.height;
    
    let maskStarGrowthLimit_Control = new NumericControl(this);
    maskStarGrowthLimit_Control.real = false;
    maskStarGrowthLimit_Control.label.text = "Growth Limit:";
    maskStarGrowthLimit_Control.label.setFixedWidth(starMaskLabelSize);
    maskStarGrowthLimit_Control.toolTip =
            "<p>Limits the growth to a maximum radius.</p>" +
            "<p>A 'Growth rate' suitable for unsaturated stars can produce large " +
            "circles for the brightest stars. This control limits the " +
            "radius growth to the specified number of pixels.</p>";
    maskStarGrowthLimit_Control.setRange(3, 400);
    maskStarGrowthLimit_Control.slider.setRange(3, 400);
    maskStarGrowthLimit_Control.maxWidth = 800;
    maskStarGrowthLimit_Control.setValue(data.maskStarGrowthLimit);
    maskStarGrowthLimit_Control.onValueUpdated = function (value) {
        data.maskStarGrowthLimit = value;
        update();
    };
    addFinalUpdateListener(maskStarGrowthLimit_Control, finalUpdateFunction);
    controlsHeight += maskStarGrowthLimit_Control.height;
    
    let maskStarRadiusAdd_Control = new NumericControl(this);
    maskStarRadiusAdd_Control.real = true;
    maskStarRadiusAdd_Control.label.text = "Radius add:";
    maskStarRadiusAdd_Control.toolTip =
            "<p>This value is added to the radius for all stars.</p>" +
            "<p>Use this control to set the radius for <b>faint stars</b> " +
            "(use 'Growth rate' for brighter stars).</p>" +
            "<p>Should normally be set to a value equal to or greater than the " +
            "photometry 'Radius add' value + 3.</p>";
    maskStarRadiusAdd_Control.label.setFixedWidth(starMaskLabelSize);
    maskStarRadiusAdd_Control.setRange(0, 30);
    maskStarRadiusAdd_Control.slider.setRange(0, 300);
    maskStarRadiusAdd_Control.setPrecision(1);
    maskStarRadiusAdd_Control.maxWidth = 800;
    maskStarRadiusAdd_Control.setValue(data.maskStarRadiusAdd);
    maskStarRadiusAdd_Control.onValueUpdated = function (value) {
        data.maskStarRadiusAdd = value;
        update();
    };
    addFinalUpdateListener(maskStarRadiusAdd_Control, finalUpdateFunction);
    controlsHeight += maskStarRadiusAdd_Control.height;
    
    let apertureSection = new Control(this);
    apertureSection.sizer = new VerticalSizer;
    apertureSection.sizer.spacing = 2;
    apertureSection.sizer.add(maskStarRadiusAdd_Control);
    apertureSection.sizer.add(maskStarGrowthRate_Control);
    apertureSection.sizer.add(maskStarGrowthLimit_Control);
    let apertureBar = new SectionBar(this, "Star Size");
    apertureBar.setSection(apertureSection);
    apertureBar.onToggleSection = this.onToggleSection;
    apertureBar.toolTip = "Specifies star size";
    controlsHeight += apertureBar.height + apertureSection.sizer.spacing * 2;
    
    // ===================================================
    // SectionBar: Star filters
    // ===================================================
    let limitMaskStars_Control = new NumericControl(this);
    limitMaskStars_Control.real = true;
    limitMaskStars_Control.label.text = "Limit stars %:";
    limitMaskStars_Control.toolTip =
            "<p>Specifies the percentage of the brightest detected stars that will be used to " +
            "create the star mask.</p>" +
            "<p>0% will produce a solid mask with no stars.<br />" +
            "100% will produce a mask that includes all detected stars.</p>" +
            "<p>Small faint stars are usually free of artifacts, so normally " +
            "only a small percentage of the detected stars need to be used.</p>";
    limitMaskStars_Control.label.setFixedWidth(starMaskLabelSize);
    limitMaskStars_Control.setRange(0, 100);
    limitMaskStars_Control.slider.setRange(0, 500);
    limitMaskStars_Control.setPrecision(2);
    limitMaskStars_Control.maxWidth = 800;
    limitMaskStars_Control.setValue(data.limitMaskStarsPercent);
    limitMaskStars_Control.onValueUpdated = function (value) {
        data.limitMaskStarsPercent = value;
        update();
    };
    addFinalUpdateListener(limitMaskStars_Control, finalUpdateFunction);
    controlsHeight += limitMaskStars_Control.height;
    
    let filterSection = new Control(this);
    filterSection.sizer = new VerticalSizer;
    filterSection.sizer.spacing = 2;
    filterSection.sizer.add(limitMaskStars_Control);
    filterSection.sizer.addSpacing(5);
    let filterBar = new SectionBar(this, "Filter Stars");
    filterBar.setSection(filterSection);
    filterBar.onToggleSection = this.onToggleSection;
    filterBar.toolTip = "Specifies which stars to unmask";
    controlsHeight += filterBar.height + 5;
    
    /**
     * Draw the stars on top of the background bitmap within the scrolled window.
     */
    function update(){
        previewControl.forceRedraw();
    }
    
    function getGrowthRateAutoValue(){
        let limit = Math.round(calcDefaultGrowthLimit(data));
        limit = Math.max(limit, 2);
        let maxStarFlux = data.cache.getMaxStarFlux(true);
        return calcStarGrowthRate(maxStarFlux, APERTURE_GROWTH, limit);
    }
    
    function setAutoValues(){
        if (data.useAutoMaskStarSize){
            data.maskStarGrowthRate = getGrowthRateAutoValue();
            data.maskStarRadiusAdd = data.apertureAdd + 3;
        }
        maskStarGrowthRate_Control.setValue(data.maskStarGrowthRate);
        maskStarRadiusAdd_Control.setValue(data.maskStarRadiusAdd);
        maskStarGrowthRate_Control.enabled = !data.useAutoMaskStarSize;
        maskStarRadiusAdd_Control.enabled = !data.useAutoMaskStarSize;
    }
    let autoCheckBox = new CheckBox(this);
    autoCheckBox.text = "Auto";
    autoCheckBox.toolTip = "Use calculated values for some fields";
    autoCheckBox.onClick = function (checked) {
        data.useAutoMaskStarSize = checked;
        setAutoValues();
        update();
    };
    autoCheckBox.checked = data.useAutoMaskStarSize;
    setAutoValues();
    let optionsSizer = new HorizontalSizer(this);
    optionsSizer.margin = 0;
    optionsSizer.addSpacing(4);
    optionsSizer.add(autoCheckBox);
    optionsSizer.addSpacing(20);
    optionsSizer.add(refCheckBox);
    optionsSizer.addStretch();
    
    controlsHeight += refCheckBox.height;

    // Global sizer
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 4;
    this.sizer.spacing = 2;
    this.sizer.add(previewControl);
    this.sizer.add(optionsSizer);
    this.sizer.add(apertureBar);
    this.sizer.add(apertureSection);
    this.sizer.add(filterBar);
    this.sizer.add(filterSection);
    this.sizer.add(previewControl.getButtonSizer());

    controlsHeight += this.sizer.margin * 2 + this.sizer.spacing * 6;

    // The PreviewControl size is determined by the size of the bitmap
    this.userResizable = true;
    let preferredWidth = previewControl.width + this.sizer.margin * 2 + this.logicalPixelsToPhysical(20);
    let preferredHeight = previewControl.height + previewControl.getButtonSizerHeight() +
            controlsHeight + this.logicalPixelsToPhysical(20);
    this.resize(preferredWidth, preferredHeight);
    
    {
        // Scroll to center of join region
        let x = joinArea.center.x - bitmapOffset.x;
        let y = joinArea.center.y - bitmapOffset.y;
        previewControl.scrollbox.horizontalScrollPosition = Math.max(0, x - previewControl.width / 2);
        previewControl.scrollbox.verticalScrollPosition = Math.max(0, y - previewControl.height / 2);
    }
    
    setTitle();
}

}
