/* global Dialog, StdCursor.ClosedHand, MouseButton_Left, StdCursor.UpArrow, StdCursor.Checkmark, TextAlignment.Left, TextAlignment.VertCenter, MAX_CIRCLE_RADIUS, MANUAL_OVERLAP_RADIUS, MANUAL_TARGET_RADIUS */

//"use strict";

#define MAX_CIRCLE_RADIUS 800
#define MANUAL_OVERLAP_RADIUS 10
#define MANUAL_TARGET_RADIUS 30

/**
 * Display the SampleGrid in a Dialog that contains a scrolled window and 
 * controls to adjust the SampleGrid parameters.
 * @param {String} title Window title
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {Number} maxSampleSize maximum allowed sample size
 * @param {Point[]} targetSide The target side envelope of the overlapping pixels
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @returns {SampleGridDialog}
 */
class SampleGridDialog extends Dialog
{
constructor(title, data, maxSampleSize, targetSide, photometricMosaicDialog)
{
super();
    
    const REF = 10;
    const TGT = 20;
    let self = this;
    let zoomText = "1:1";
    let coordText;
    setCoordText(null);
    let selectedBitmap = REF;
    let refBitmap = data.cache.overlap.refBitmap;
    let tgtBitmap = data.cache.overlap.tgtBitmap;
    let bitmap = getBitmap(selectedBitmap);
    let bitmapOffset = getBitmapOffset(data);
    let drawOverlapRejectionFlag = true;
    let selectedCircleIdx = -1;
    let allStars = data.cache.getAllDetectedStars();
    let binRects = getBinRects();
    
    /**
     * @returns {Rect[]} The sample grid
     */
    function getBinRects(){
        let sampleGrid = data.cache.getSampleGrid(data);
        return sampleGrid.getBinRectArray(allStars, data, drawOverlapRejectionFlag);
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
    function drawSampleGrid(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.antialiasing = false;
            
            graphics.pen = new Pen(0xff000000, 0);
            data.cache.overlap.drawOverlapOutline(graphics, bitmapOffset.x, bitmapOffset.y);
            
            // Draw the sample grid
            graphics.pen = new Pen(0xffff0000);
            for (let binRect of binRects){
                let rect = new Rect(binRect);
                rect.translateBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.drawRect(rect);
            }

            let red  =  0xffff0000;
            let blue =  0xff0000ff;
            drawRejectionCircles(graphics, 1, red, blue, data, allStars, 
                    bitmapOffset, drawOverlapRejectionFlag, selectedCircleIdx);
            
            graphics.antialiasing = false;
            graphics.pen = new Pen(0xff00ff00, 2.0);
            if (data.useCropTargetToReplaceRegion){
                // Replace region. Draw Join Region rectangle
                let joinRegion = new JoinRegion(data);
                let joinRect = new Rect(joinRegion.joinRect);
                joinRect.translateBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.drawRect(joinRect);
            } else {
                // Overlay mosaic mode. Draw join path
                graphics.pen = drawOverlapRejectionFlag ? new Pen(0xff00ff00, 2.0) : new Pen(0xff0000ff, 2.0);
                for (let i=1; i < targetSide.length; i++){
                    let x = targetSide[i-1].x - bitmapOffset.x;
                    let x2 = targetSide[i].x - bitmapOffset.x;
                    let y = targetSide[i-1].y - bitmapOffset.y;
                    let y2 = targetSide[i].y - bitmapOffset.y;
                    graphics.drawLine(x, y, x2, y2);
                }
            }
            
        } catch (e) {
            console.criticalln("drawSampleGrid error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    // =================================
    // Sample Generation Preview frame
    // =================================
    let previewWidth = 1800;
    let previewHeight = 715;
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
        drawSampleGrid(viewport, translateX, translateY, scale, x0, y0, x1, y1);
    };
    previewControl.addCtrlClickListener(ctrlClickListener);
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
    refCheckBox.toolTip = "Display either the reference or target overlap region.";
    refCheckBox.checked = true;
    refCheckBox.onClick = function (checked) {
        selectedBitmap = checked ? REF : TGT;
        bitmap = getBitmap(selectedBitmap);
        previewControl.updateBitmap(bitmap);
        previewControl.forceRedraw();
    };
    
    let sampleStarGrowthRate_Control;
    let sampleStarGrowthRateTarget_Control;
    
    function displayModel(isTargetModel){
        sampleStarGrowthRate_Control.enabled = !data.useAutoSampleGeneration && !isTargetModel;
        sampleStarGrowthRateTarget_Control.enabled = !data.useAutoSampleGeneration && isTargetModel;
        drawOverlapRejectionFlag = !isTargetModel;
        finalUpdateFunction();
    }
    
    let displayOverlapModel_radioButton = new RadioButton(this);
    displayOverlapModel_radioButton.text = "Overlap model";
    displayOverlapModel_radioButton.toolTip =
            "<p>Show the sample rejection for " +
            "the <b>overlap</b> surface spline model</p>" +
            "<p><ul><li><b>Green line</b>: Join Path (join between reference and target images).</li>" +
            "<li><b>Green rectangle</b>: Join Region bounding box. " +
            "Shown instead of the Join Path for 'Blend' and 'Average' modes. " +
            "Mosaiced pixels within this area will be randomly chosen or averaged respectively.</li>" +
            "<li><b>Red circles</b>: Star rejection circles. These circles should surround " +
            "the bright stars, but do not need to include filter halos or scattered light.</li></ul>";
    displayOverlapModel_radioButton.checked = drawOverlapRejectionFlag;
    displayOverlapModel_radioButton.onClick = function (checked) {
        displayModel(!checked);
    };
    let displayTargetModel_radioButton = new RadioButton(this);
    displayTargetModel_radioButton.text = "Target model";
    displayTargetModel_radioButton.toolTip = 
            "<p>Show the sample rejection for " +
            "the <b>target image</b> surface spline model.</p>" +
            "<ul><li><b>Blue line</b>: the transition between the detailed overlap correction " +
            "and the smoother correction applied to the rest of the target image. " +
            "The smoother target correction is gradually tapered in. " +
            "The blue line indicates the start of this taper.</li>" +
            "<li><b>Blue circles</b>: Star rejection circles. The brighter stars " +
            "should be completely within these circles. Aim to include their " +
            "filter halos and scattered light. This prevents local gradients " +
            "around bright stars affecting the gradient correction across the target image. " +
            "Rejecting local gradients is particularly important near the blue line.</li></ul>";
    displayTargetModel_radioButton.checked = !drawOverlapRejectionFlag;
    displayTargetModel_radioButton.onClick = function (checked) {
        displayModel(checked);
    };
    if (data.useCropTargetToReplaceRegion || !data.useTargetGradientCorrection){
        // Only the overlap - join region is used. The rest of the target image is 
        // not modified, so target image gradient correction is not used.
        displayTargetModel_radioButton.checked = false;
        displayTargetModel_radioButton.enabled = false;
    }
    
    let sampleControls = new SampleControls;
    
    /**
     * When a slider is dragged, only fast draw operations are performed.
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform all calculations.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        updateSampleGrid();
        self.enabled = true;
    }
    
    // ===================================================
    // SectionBar: Sample rejection
    // ===================================================
    let limitSampleStarsPercent_Control = 
                sampleControls.createLimitSampleStarsPercentControl(this, data, 0);
    limitSampleStarsPercent_Control.onValueUpdated = function (value) {
        data.limitSampleStarsPercent = value;
        photometricMosaicDialog.limitSampleStarsPercent_Control.setValue(value);
        previewControl.forceRedraw();
    };
    limitSampleStarsPercent_Control.enabled = !data.useAutoSampleGeneration;
    addFinalUpdateListener(limitSampleStarsPercent_Control, finalUpdateFunction);
    
    let filterGroupBox = new GroupBox(this);
    filterGroupBox.title = "Filter stars";
    filterGroupBox.sizer = new VerticalSizer();
    filterGroupBox.sizer.margin = 2;
    filterGroupBox.sizer.spacing = 2;
    filterGroupBox.sizer.add(limitSampleStarsPercent_Control);
    
    controlsHeight += limitSampleStarsPercent_Control.height;
    controlsHeight += filterGroupBox.height + filterGroupBox.sizer.margin * 2;
        
    sampleStarGrowthRate_Control =
                sampleControls.createSampleStarGrowthRateControl(this, data, 0);
    sampleStarGrowthRate_Control.onValueUpdated = function (value){
        data.sampleStarGrowthRate = value;
        photometricMosaicDialog.sampleStarGrowthRate_Control.setValue(value);
        previewControl.forceRedraw();
    };
    addFinalUpdateListener(sampleStarGrowthRate_Control, finalUpdateFunction);
    sampleStarGrowthRate_Control.enabled = !data.useAutoSampleGeneration && !displayTargetModel_radioButton.checked;
    
    sampleStarGrowthRateTarget_Control =
            sampleControls.createSampleStarGrowthRateTargetControl(this, data, 0);
    sampleStarGrowthRateTarget_Control.onValueUpdated = function (value){
        data.sampleStarGrowthRateTarget = value;
        photometricMosaicDialog.sampleStarGrowthRateTarget_Control.setValue(value);
        previewControl.forceRedraw();
    };
    addFinalUpdateListener(sampleStarGrowthRateTarget_Control, finalUpdateFunction);
    sampleStarGrowthRateTarget_Control.enabled = !data.useAutoSampleGeneration && displayTargetModel_radioButton.checked;
    
    let rejectRadiusGroupBox = new GroupBox(this);
    rejectRadiusGroupBox.title = "Overlap model sample rejection";
    rejectRadiusGroupBox.sizer = new VerticalSizer();
    rejectRadiusGroupBox.sizer.margin = 2;
    rejectRadiusGroupBox.sizer.spacing = 2;
    rejectRadiusGroupBox.sizer.add(sampleStarGrowthRate_Control);
    
    let rejectRadiusTargetGroupBox = new GroupBox(this);
    rejectRadiusTargetGroupBox.title = "Target model sample rejection";
    rejectRadiusTargetGroupBox.sizer = new VerticalSizer();
    rejectRadiusTargetGroupBox.sizer.margin = 2;
    rejectRadiusTargetGroupBox.sizer.spacing = 2;
    rejectRadiusTargetGroupBox.sizer.add(sampleStarGrowthRateTarget_Control);
    
    controlsHeight += sampleStarGrowthRate_Control.height + 
            sampleStarGrowthRateTarget_Control.height +
            rejectRadiusGroupBox.height + 
            rejectRadiusTargetGroupBox.height + 
            rejectRadiusGroupBox.sizer.margin * 2;
    
    let rejectSamplesSection = new Control(this);
    rejectSamplesSection.sizer = new VerticalSizer;
    rejectSamplesSection.sizer.spacing = 2;
    rejectSamplesSection.sizer.add(rejectRadiusGroupBox);
    rejectSamplesSection.sizer.add(rejectRadiusTargetGroupBox);
    rejectSamplesSection.sizer.add(filterGroupBox);
    let rejectSamplesBar = new SectionBar(this, "Sample Rejection");
    rejectSamplesBar.setSection(rejectSamplesSection);
    rejectSamplesBar.onToggleSection = this.onToggleSection;
    rejectSamplesBar.toolTip = "Reject samples that are too close to bright stars";
    controlsHeight += rejectSamplesBar.height + 2;
    // SectionBar "Sample Rejection" End

    // ===================================================
    // SectionBar: Manual Sample Rejection
    // ===================================================
    let overlapRadius = MANUAL_OVERLAP_RADIUS;
    let targetRadius = MANUAL_TARGET_RADIUS;
    let nthCircle_Label = new Label();
    nthCircle_Label.textAlignment = TextAlignment.VertCenter;

    let ctrlClickToolTip = "<p><b>Ctrl click</b> on an undetected star to add a manual rejection circle.</p>";
    let toStart_Button = new ToolButton(this);
    toStart_Button.icon = this.scaledResource(":/arrows/arrow-left-limit.png");
    toStart_Button.toolTip = "<p>Move to the first rejection circle.</p>" + ctrlClickToolTip;
    toStart_Button.onClick = function () {
        setNthCircleEntry(0, true);
    };
    let previous_Button = new ToolButton(this);
    previous_Button.icon = this.scaledResource(":/arrows/arrow-left.png");
    previous_Button.toolTip = "<p>Move to the previous rejection circle.</p>" + ctrlClickToolTip;
    previous_Button.onClick = function () {
        let n = selectedCircleIdx;
        if (n > 0){
            setNthCircleEntry(n - 1, true);
        }
    };
    let next_Button = new ToolButton(this);
    next_Button.icon = this.scaledResource(":/arrows/arrow-right.png");
    next_Button.toolTip = "<p>Move to the next rejection circle.</p>" + ctrlClickToolTip;
    next_Button.onClick = function () {
        let n = selectedCircleIdx;
        setNthCircleEntry(n + 1, true);
    };
    let toEnd_Button = new ToolButton(this);
    toEnd_Button.icon = this.scaledResource(":/arrows/arrow-right-limit.png");
    toEnd_Button.toolTip = "<p>Move to the last rejection circle.</p>" + ctrlClickToolTip;
    toEnd_Button.onClick = function () {
        setNthCircleEntry(data.manualRejectionCircles.length - 1, true);
    };
    let delete_Button = new ToolButton(this);
    delete_Button.icon = this.scaledResource(":/file-explorer/delete.png");
    delete_Button.toolTip = "<p>Delete the currently selected manual rejection circle.</p>";
    delete_Button.enabled = false;
    delete_Button.onClick = function () {
        data.manualRejectionCircles.splice(selectedCircleIdx, 1);
        setNthCircleEntry(-1, false);
        finalUpdateFunction();
    };
    let finish_Button = new ToolButton(this);
    finish_Button.icon = this.scaledResource(":/icons/ok.png");
    finish_Button.toolTip = "<p>Clears the current selection.</p>";
    finish_Button.onClick = function () {
        setNthCircleEntry(-1, false);
    };
    
    let toolbarSizer = new HorizontalSizer(this);
    toolbarSizer.spacing = 10;
    toolbarSizer.add(nthCircle_Label);
    toolbarSizer.add(toStart_Button);
    toolbarSizer.add(previous_Button);
    toolbarSizer.add(next_Button);
    toolbarSizer.add(toEnd_Button);
    toolbarSizer.addSpacing(10);
    toolbarSizer.add(delete_Button);
    toolbarSizer.add(finish_Button);
    toolbarSizer.addStretch();
    
    let overlapRadiusText = "Radius (Overlap):";
    let overlapRadiusTextLen = this.font.width(overlapRadiusText);
    let maxWidth = this.logicalPixelsToPhysical(800);
    
    let overlapRadius_Control = new NumericControl(this);
    overlapRadius_Control.real = false;
    overlapRadius_Control.label.text = overlapRadiusText;
    overlapRadius_Control.maxWidth = Math.max(overlapRadiusTextLen + 50, maxWidth);
    overlapRadius_Control.toolTip = "<p>Overlap model sample rejection circle radius.</p>" + 
        "<p>Although this can be edited in either the 'Overlap model' or 'Target model' mode, " +
        "the edit is often easier to judge with 'Overlap model' selected.</p>" +
        ctrlClickToolTip;
    overlapRadius_Control.setRange(0, MAX_CIRCLE_RADIUS);
    overlapRadius_Control.slider.setRange(0, MAX_CIRCLE_RADIUS);
    overlapRadius_Control.onValueUpdated = function (value) {
        let idx = selectedCircleIdx;
        if (idx !== -1){
            data.manualRejectionCircles[idx].overlapRadius = value;
            previewControl.forceRedraw();
        }
    };
    addFinalUpdateListener(overlapRadius_Control, finalUpdateFunction);

    let targetRadius_Control = new NumericControl(this);
    targetRadius_Control.real = false;
    targetRadius_Control.label.text = "Radius (Target):";
    targetRadius_Control.label.textAlignment = TextAlignment.Left;
    targetRadius_Control.label.minWidth = overlapRadiusTextLen;
    targetRadius_Control.maxWidth = Math.max(overlapRadiusTextLen + 50, maxWidth);
    targetRadius_Control.toolTip = "<p>Target model sample rejection circle radius.</p>" +
        "<p>Although this can be edited in either the 'Overlap model' or 'Target model' mode, " +
        "the edit is often easier to judge with 'Target model' selected.</p>" +
        ctrlClickToolTip;
    targetRadius_Control.setRange(0, MAX_CIRCLE_RADIUS);
    targetRadius_Control.slider.setRange(0, MAX_CIRCLE_RADIUS);
    targetRadius_Control.onValueUpdated = function (value) {
        let idx = selectedCircleIdx;
        if (idx !== -1){
            data.manualRejectionCircles[idx].targetRadius = value;
            previewControl.forceRedraw();
        }
    };
    addFinalUpdateListener(targetRadius_Control, finalUpdateFunction);

    let manualSampleRejectionSection = new Control(this);
    manualSampleRejectionSection.sizer = new VerticalSizer;
    manualSampleRejectionSection.sizer.spacing = 2;
    manualSampleRejectionSection.sizer.add(toolbarSizer);
    manualSampleRejectionSection.sizer.add(overlapRadius_Control);
    manualSampleRejectionSection.sizer.add(targetRadius_Control);
    let manualSampleRejectionBar = new SectionBar(this, "Manual Sample Rejection");
    manualSampleRejectionBar.setSection(manualSampleRejectionSection);
    manualSampleRejectionBar.onToggleSection = this.onToggleSection;
    manualSampleRejectionBar.toolTip = 
        "<p>The star detection can fail to detect very bright saturated stars, " +
        "or stars too close to the image edge. " +
        "This section provides the ability to add manual rejection circles around problem stars.</p>" +
        ctrlClickToolTip;
    controlsHeight += manualSampleRejectionBar.height;
    
    function ctrlClickListener(point, button, buttonState, modifiers){
        let x = bitmapOffset.x + point.x;
        let y = bitmapOffset.y + point.y;
        data.manualRejectionCircles.push(new ManualRejectionCircle(x, y, overlapRadius, targetRadius));
        setNthCircleEntry(data.manualRejectionCircles.length - 1, false);
        finalUpdateFunction();
    }
    
    function setSelectedCircleLabel(){
        let nEntries = data.manualRejectionCircles.length;
        nthCircle_Label.text = "Circle #: (" + (selectedCircleIdx + 1) + " / " + nEntries + ")";
        nthCircle_Label.toolTip = "<p>Indicates which circle is currently selected (1 to N).</p>" + 
                ctrlClickToolTip;
    }
    
    function setNthCircleEntry(idx, scrollToCenter){
        let nEntries = data.manualRejectionCircles.length;
        if (idx >= -1 && idx < nEntries){
            if (idx !== -1){
                let entry = data.manualRejectionCircles[idx];
                overlapRadius_Control.setValue(entry.overlapRadius);
                targetRadius_Control.setValue(entry.targetRadius);
                if (scrollToCenter){
                    let x = (entry.x - bitmapOffset.x) * previewControl.scale;
                    let y = (entry.y - bitmapOffset.y) * previewControl.scale;
                    previewControl.scrollbox.horizontalScrollPosition = Math.max(0, x - previewControl.width / 2);
                    previewControl.scrollbox.verticalScrollPosition = Math.max(0, y - previewControl.height / 2);
                }
            } else {
                overlapRadius_Control.setValue(0);
                targetRadius_Control.setValue(0);
            }
            selectedCircleIdx = idx;
            setSelectedCircleLabel();
            overlapRadius_Control.enabled = idx > -1;
            targetRadius_Control.enabled = idx > -1;
            toStart_Button.enabled = idx > 0;
            previous_Button.enabled = idx > 0;
            next_Button.enabled = idx < nEntries - 1;
            toEnd_Button.enabled = idx < nEntries - 1;
            delete_Button.enabled = idx !== -1;
            finish_Button.enabled = idx !== -1;
        }
        previewControl.forceRedraw();
    }
    
    setNthCircleEntry(-1, false);
    
    // SectionBar "Manual Sample Rejection" End

    // ===================================================
    // SectionBar: Samples
    // ===================================================
    let sampleSize_Control = sampleControls.createSampleSizeControl(
            this, data, maxSampleSize, 0);
    sampleSize_Control.onValueUpdated = function (value) {
        data.sampleSize = value;
        photometricMosaicDialog.sampleSize_Control.setValue(value);
    };
    addFinalUpdateListener(sampleSize_Control, finalUpdateFunction);
    
    sampleSize_Control.enabled = !data.useAutoSampleGeneration;
//    controlsHeight += sampleSize_Control.height;
    let sampleGenerationSection = new Control(this);
    sampleGenerationSection.sizer = new VerticalSizer;
    sampleGenerationSection.sizer.add(sampleSize_Control);
    let sampleGenerationBar = new SectionBar(this, "Samples");
    sampleGenerationBar.setSection(sampleGenerationSection);
    sampleGenerationBar.onToggleSection = this.onToggleSection;
    sampleGenerationBar.toolTip = "Specifies generate samples settings";
    controlsHeight += sampleGenerationBar.height;
    // SectionBar "Sample Rejection" End
    
    /**
     * Create a new SampleGrid from the updated parameters, and draw it 
     * on top of the background bitmap within the scrolled window.
     */
    function updateSampleGrid(){
        binRects = getBinRects();
        previewControl.forceRedraw();
    }
    
    let autoCheckBox = new CheckBox(this);
    autoCheckBox.text = "Auto";
    autoCheckBox.toolTip = "<p>Calculates default values for most of the Sample Generation parameters.</p>" +
            "<p>These are calculated from the headers:" +
            "<ul><li><b>'XPIXSZ'</b> (Pixel size, including binning, in microns)</li>" +
            "<li><b>'FOCALLEN'</b> (Focal length in mm).</li></p>";
    autoCheckBox.onClick = function (checked) {
        photometricMosaicDialog.setSampleGenerationAutoValues(checked);
        if (checked){
            self.enabled = false;
            sampleStarGrowthRate_Control.setValue(data.sampleStarGrowthRate);
            sampleStarGrowthRateTarget_Control.setValue(data.sampleStarGrowthRateTarget);
            sampleSize_Control.setValue(data.sampleSize);
            limitSampleStarsPercent_Control.setValue(data.limitSampleStarsPercent);
            CoreApplication.processEvents();
            updateSampleGrid();
            self.enabled = true;
        }
        sampleStarGrowthRate_Control.enabled = !checked && !displayTargetModel_radioButton.checked;
        sampleStarGrowthRateTarget_Control.enabled = !checked && displayTargetModel_radioButton.checked;
        sampleSize_Control.enabled = !checked;
        limitSampleStarsPercent_Control.enabled = !checked;
    };
    autoCheckBox.checked = data.useAutoSampleGeneration;
    
    let optionsSizer = new HorizontalSizer(this);
    optionsSizer.margin = 0;
    optionsSizer.addSpacing(4);
    optionsSizer.add(autoCheckBox);
    optionsSizer.addSpacing(20);
    optionsSizer.add(refCheckBox);
    optionsSizer.addSpacing(20);
    optionsSizer.add(displayOverlapModel_radioButton);
    optionsSizer.addSpacing(8);
    optionsSizer.add(displayTargetModel_radioButton);
    optionsSizer.addStretch();
    
    controlsHeight += refCheckBox.height;

    // Global sizer
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 2;
    this.sizer.spacing = 2;
    this.sizer.add(previewControl);
    this.sizer.add(optionsSizer);
    this.sizer.add(rejectSamplesBar);
    this.sizer.add(rejectSamplesSection);
    this.sizer.add(manualSampleRejectionBar);
    this.sizer.add(manualSampleRejectionSection);
    this.sizer.add(sampleGenerationBar);
    this.sizer.add(sampleGenerationSection);
    this.sizer.add(previewControl.getButtonSizer());
    
    if (data.manualRejectionCircles.length === 0)
        manualSampleRejectionSection.hide();
    sampleGenerationSection.hide();

    controlsHeight += this.sizer.spacing * 6 + this.sizer.margin * 2;

    // The PreviewControl size is determined by the size of the bitmap
    // The dialog must also leave enough room for the extra controls we are adding
    this.userResizable = true;
    let preferredWidth = previewControl.width + this.sizer.margin * 2 + this.logicalPixelsToPhysical(20);
    let preferredHeight = previewControl.height + previewControl.getButtonSizerHeight() +
            controlsHeight + this.logicalPixelsToPhysical(20);
    this.resize(preferredWidth, preferredHeight);
    setTitle();
}
}

/**
 *
 * @param {Number} x
 * @param {Number} y
 * @param {Number} overlapRadius
 * @param {Number} targetRadius
 * @returns {ManualRejectionCircle}
 */
function ManualRejectionCircle (x, y, overlapRadius, targetRadius) {
    this.x = x;
    this.y = y;
    this.overlapRadius = overlapRadius;
    this.targetRadius = targetRadius;
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
 * Draw rejection circles around stars
 * @param {Graphics} graphics
 * @param {Number} penWidth 
 * @param {Number} red color for overlap
 * @param {Number} blue color for target
 * @param {NsgData} data
 * @param {Star[]) allStars
 * @param {Point} bitmapOffset 
 * @param {Boolean} isOverlap 
 * @param {Number} selectedCircleIdx Selected manual circle or -1
 */
function drawRejectionCircles(graphics, penWidth, red, blue, data, allStars, bitmapOffset, isOverlap, selectedCircleIdx){
    // Draw circles around the stars used to reject grid sample squares
    let firstNstars;
    if (data.limitSampleStarsPercent < 100){
        firstNstars = Math.floor(allStars.length * data.limitSampleStarsPercent / 100);
    } else {
        firstNstars = allStars.length;
    }
    let starGrowthRate = isOverlap ? data.sampleStarGrowthRate : data.sampleStarGrowthRateTarget;
    let origAntialiasing = graphics.antialiasing;
    graphics.antialiasing = true;
    graphics.pen = isOverlap ? new Pen(red, penWidth) : new Pen(blue, penWidth);
    for (let i = 0; i < firstNstars; ++i){
        let star = allStars[i];
        let radius = calcSampleStarRejectionRadius(star, data, starGrowthRate);
        let x = star.pos.x - bitmapOffset.x;
        let y = star.pos.y - bitmapOffset.y;
        graphics.strokeCircle(x, y, radius);
    }
    let selectedWidth = Math.max(1, penWidth * 2);
    for (let i = 0; i < data.manualRejectionCircles.length; i++){
        let circle = data.manualRejectionCircles[i];
        let x = circle.x - bitmapOffset.x;
        let y = circle.y - bitmapOffset.y;
        if (i === selectedCircleIdx){
            if (isOverlap){
                // Draw target circle beneath. It will be the only blue circle.
                graphics.pen = new Pen(blue, selectedWidth);
                graphics.strokeCircle(x, y, circle.targetRadius);
                // Draw overlap circle on top, with thicker line to contrast against unselected.
                graphics.pen = new Pen(red, selectedWidth);
                graphics.strokeCircle(x, y, circle.overlapRadius);
            } else {
                // Draw overlap circle beneath. It will be the only red circle.
                graphics.pen = new Pen(red, selectedWidth);
                graphics.strokeCircle(x, y, circle.overlapRadius);
                // Draw target circle on top, with thicker line to contrast against unselected.
                graphics.pen = new Pen(blue, selectedWidth);
                graphics.strokeCircle(x, y, circle.targetRadius);
            }
            graphics.pen = isOverlap ? new Pen(red, penWidth) : new Pen(blue, penWidth);
        } else {
            let radius = isOverlap ? circle.overlapRadius : circle.targetRadius;
            graphics.strokeCircle(x, y, radius);
        }
    }
    graphics.antialiasing = origAntialiasing;
}
