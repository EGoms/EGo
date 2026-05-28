/* global Dialog, StdCursor.ClosedHand, MouseButton_Left, StdCursor.UpArrow, StdCursor.Checkmark, DEFAULT_JOIN_SIZE */

//"use strict";

/**
 * Display the Join Size and Position in a Dialog that contains a scrolled window and 
 * controls to adjust the join size and position parameters.
 * @param {String} title Window title
 * @param {Bitmap} refBitmap Background image of the reference overlap area at 1:1 scale
 * @param {Bitmap} tgtBitmap Background image of the target overlap area at 1:1 scale
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {Boolean} isHorizontal 
 * @param {Boolean} isTargetAfterRef 
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @returns {JoinDialog}
 */
class JoinDialog extends Dialog
{
constructor(title, refBitmap, tgtBitmap, data, isHorizontal, isTargetAfterRef, photometricMosaicDialog)
{
super();
    
    let self = this;
    let displayGridFlag = false;
    let displayJoinFlag = true;
    let zoomText = "1:1";
    let coordText;
    setCoordText(null);
    let targetSide;
    let referenceSide;
    let bitmapOffset = getBitmapOffset(data);
    let bitmap = new Bitmap(refBitmap.width, refBitmap.height);
    paintBitmap(bitmap, refBitmap, tgtBitmap, isHorizontal, isTargetAfterRef, data.joinPosition);
    
    /**
     * @param {Bitmap} bitmap Modified
     * @param {Bitmap} refBitmap
     * @param {Bitmap} tgtBitmap
     * @param {Boolean} isHorizontal 
     * @param {Boolean} isTargetAfterRef
     * @param {int} joinPosition
     */
    function paintBitmap(bitmap, refBitmap, tgtBitmap, isHorizontal, isTargetAfterRef, joinPosition){
        let firstPoint = new Point(0, 0);
        let lastPoint;
        let firstRect;
        let lastRect;
        if (isTargetAfterRef === null){
            // Join Mode: Replace/update a rectangular area
            // Start with a copy of the ref image
            bitmap.copy(refBitmap);
            // Copy the rectangle from the target bitmap
            let joinRegion = new JoinRegion(data);
            let joinRect = new Rect(joinRegion.joinRect);
            let copyRect = joinRect.translatedBy(-bitmapOffset.x, -bitmapOffset.y);
            copyRect = copyRect.intersection( bitmap.bounds );
            bitmap.copy( new Point(copyRect.x0, copyRect.y0), tgtBitmap, copyRect );
            return;
        }
        if (isHorizontal){
            let join = Math.round(joinPosition + refBitmap.height / 2);
            join = Math.max(0, join);
            join = Math.min(refBitmap.height, join);
            lastPoint = new Point(0, join);
            firstRect = new Rect(firstPoint.x, firstPoint.y, refBitmap.width, join);
            lastRect = new Rect(lastPoint.x, lastPoint.y, tgtBitmap.width, tgtBitmap.height);
        } else {
            let join = Math.round(joinPosition + refBitmap.width / 2);
            join = Math.max(0, join);
            join = Math.min(refBitmap.width, join);
            lastPoint = new Point(join, 0);
            firstRect = new Rect(firstPoint.x, firstPoint.y, join, refBitmap.height);
            lastRect = new Rect(lastPoint.x, lastPoint.y, tgtBitmap.width, tgtBitmap.height);
        }
        
        let refPoint;
        let tgtPoint;
        let refRect;
        let tgtRect;
        if (isTargetAfterRef){
            refPoint = firstPoint;
            refRect = firstRect;
            tgtPoint = lastPoint;
            tgtRect = lastRect;
        } else {
            refPoint = lastPoint;
            refRect = lastRect;
            tgtPoint = firstPoint;
            tgtRect = firstRect;
        }
        bitmap.copy( refPoint, refBitmap, refRect);
        bitmap.copy( tgtPoint, tgtBitmap, tgtRect);
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
    function drawJoin(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.antialiasing = false;
            graphics.pen = new Pen(0xff000000, 0);
            data.cache.overlap.drawOverlapOutline(graphics, bitmapOffset.x, bitmapOffset.y);

            if (data.useMosaicAverage || data.useMosaicRandom){
                // Taper line, reference side
                graphics.pen = new Pen(0xff008800, 2.0);
                drawPolyline(graphics, referenceSide, bitmapOffset.x, bitmapOffset.y);
            }

            if (displayJoinFlag){
                graphics.pen = new Pen(0xff00ff00, 2.0);
                if (data.useCropTargetToReplaceRegion){
                    let joinRegion = new JoinRegion(data);
                    let joinRect = new Rect(joinRegion.joinRect);
                    joinRect.translateBy(-bitmapOffset.x, -bitmapOffset.y);
                    graphics.drawRect(joinRect);
                } else {
                    // Taper line, target side
                    drawPolyline(graphics, targetSide, bitmapOffset.x, bitmapOffset.y);
                }
            }
        } catch (e) {
            console.criticalln("JoinDialog error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    function drawGrid(viewport, translateX, translateY, scale, x0, y0, x1, y1){
        let graphics;
        try {
            // Draw the grid without any sample rejection
            let sampleGrid = data.cache.getSampleGrid(data);
            let binRects = sampleGrid.getBinRectArray([], data, true);

            graphics = new Graphics(viewport);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.translateTransformation(translateX, translateY);
            graphics.scaleTransformation(scale, scale);
            graphics.pen = new Pen(0xff660000);
            graphics.antialiasing = false;

            // Draw the sample grid
            for (let binRect of binRects){
                let rect = new Rect(binRect);
                rect.translateBy(-bitmapOffset.x, -bitmapOffset.y);
                graphics.drawRect(rect);
            }
        } catch (e) {
            console.criticalln("JoinDialog error: " + e);
        } finally {
            graphics.end();
        }
    }
    
    // =================================
    // Join Dialog Preview frame
    // =================================
    let previewWidth = 1800;
    let previewHeight = 955;
    if (data.smallScreen){
        previewHeight -= 300;
    }
    
    function addCustomControls(sizer){
        let gridCheckBox = new CheckBox(self);
        gridCheckBox.text = "Show sample grid";
        gridCheckBox.toolTip = "<p>Display the sample grid.</p>" +
                "<p>Try to avoid placing the join outside the grid area.</p>" +
                "<p>No sample rejection is shown. To view this, use the 'Sample generation' dialog.</p>";
        gridCheckBox.checked = false;
        gridCheckBox.onClick = function (checked) {
            displayGridFlag = checked;
            previewControl.forceRedraw();
        };
        sizer.addSpacing(10);
        sizer.add(gridCheckBox);
        
        let joinCheckBox = new CheckBox(self);
        joinCheckBox.text = "Join line";
        joinCheckBox.toolTip = "<p>A bright green line indicates the join position.</p>" +
                "<p>The best join position may depend on the quality of the reference and target " +
                "images. This can sometimes be easier to judge without the drawn line.</p>";
        joinCheckBox.checked = true;
        joinCheckBox.onClick = function (checked) {
            displayJoinFlag = checked;
            previewControl.forceRedraw();
        };
        sizer.addSpacing(10);
        sizer.add(joinCheckBox);
    }
    
    let previewControl = new PreviewControl(this, bitmap, previewWidth, previewHeight, null, addCustomControls, false);
    previewControl.updateZoomText = function (text){
        zoomText = text;
        setTitle();
    };
    previewControl.updateCoord = function (point){
        setCoordText(point);
        setTitle();
    };
    let lastJoinPosition;
    previewControl.onCustomPaintScope = this;
    previewControl.onCustomPaint = function (viewport, translateX, translateY, scale, x0, y0, x1, y1){
        if (lastJoinPosition !== data.joinPosition){
            lastJoinPosition = data.joinPosition;
            paintBitmap(bitmap, refBitmap, tgtBitmap, isHorizontal, isTargetAfterRef, data.joinPosition);
            previewControl.updateBitmap(bitmap);
        }
        if (displayGridFlag)
            drawGrid(viewport, translateX, translateY, scale, x0, y0, x1, y1);
        
        drawJoin(viewport, translateX, translateY, scale, x0, y0, x1, y1);
    };
    let doubleClickListener = function ( x, y, buttonState, modifiers ){
        let value = isHorizontal ? y : x;
        let totalRange = isHorizontal ? refBitmap.height : refBitmap.width;
        let overlapMid = Math.floor((totalRange - 1)/2);
        value -= overlapMid;
        joinPosition_Control.setValue(value);
        data.joinPosition = joinPosition_Control.value;
        update();
        finalJoinPositionUpdateFunction();
    };
    previewControl.addDoubleClickListener(doubleClickListener);
    previewControl.ok_Button.onClick = function(){
        self.ok();
    };
    if (data.useCropTargetToReplaceRegion) {
        previewControl.toolTip = 
            "<p>The green rectangle shows the mosaic area that will be replaced by the target image.</p>";
    } else {
        previewControl.toolTip =
            "<p>The join path is indicated by a bright green line.</p>" +
                "<p>On the target side of the join path, the detailed correction over the " +
                "overlap region is tapered to the smoother correction applied to the " +
                "rest of the target image.</p>" +
                "<p>Blend and Average modes: On the reference side of the join path, " +
                "up until the dark green line, the difference in noise " +
                "between the two images are blended together.</p>" +
                "<p>Try to keep the join path within the sample grid area " +
                "('Show sample grid' check box) and avoid bright stars, image corners " +
                "and contrasty areas.</p>";
    }
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
    
    let joinSize_Control;
    let joinPosition_Control;
    let sampleControls = new SampleControls();

    // ===================================================
    // SectionBar: Join Position
    // ===================================================
    /**
     * Force the joinPosition to update after the user edits the textbox directly.
     */
    function finalJoinSizeUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        previewControl.forceRedraw();
        self.enabled = true;
        // Update the main dialog's join value
        photometricMosaicDialog.joinSize_Control.setValue(data.joinSize);
    }
    /**
     * Force the joinPosition to update after the user edits the textbox directly.
     */
    function finalJoinPositionUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        previewControl.forceRedraw();
        self.enabled = true;
        // Update the main dialog's position value
        photometricMosaicDialog.joinPosition_Control.setValue(data.joinPosition);
    }
    
    function update(){
        let joinRegion = new JoinRegion(data);
        let isHorizontal = joinRegion.isJoinHorizontal();
        let overlap = data.cache.overlap;
        targetSide = createTaperPath(overlap, joinRegion.getJoin(), isHorizontal);
        referenceSide = createJoinAreaPath(overlap, targetSide, data.joinSize, isHorizontal, isTargetAfterRef);
        previewControl.forceRedraw();
    }
    
    const labelWidth = Math.max(this.font.width("Size %:"), this.font.width("Position (+/-):"));
    joinSize_Control = sampleControls.createJoinSizeControl(this, data, 0);
    joinSize_Control.label.minWidth = labelWidth;
    joinSize_Control.onValueUpdated = function (value) {
        data.joinSize = value;
        update();
    };
    addFinalUpdateListener(joinSize_Control, finalJoinSizeUpdateFunction);
    joinSize_Control.enabled = 
            !data.useMosaicOverlay &&
            !data.useCropTargetToReplaceRegion;
    
    let joinSizeResetControl = sampleControls.createJoinSizeResetControl(this);
    joinSizeResetControl.onClick = function(){
        data.joinSize = DEFAULT_JOIN_SIZE;
        joinSize_Control.setValue(data.joinSize);
        update();
        finalJoinSizeUpdateFunction();
    };
    
    joinPosition_Control = sampleControls.createJoinPositionControl(this, data, 0);
    joinPosition_Control.label.minWidth = labelWidth;
    joinPosition_Control.onValueUpdated = function (value) {
        data.joinPosition = value;
        update();
    };
    addFinalUpdateListener(joinPosition_Control, finalJoinPositionUpdateFunction);
    joinPosition_Control.enabled = !data.useCropTargetToReplaceRegion;
    
    let joinPositionResetControl = sampleControls.createJoinPositionResetControl(this);
    joinPositionResetControl.onClick = function(){
        data.joinPosition = 0;
        joinPosition_Control.setValue(data.joinPosition);
        update();
        finalJoinPositionUpdateFunction();
    };
    
    let joinText;
    let midRegionText;
    if (data.useMosaicRandom){
        midRegionText = "Mid:Blend, ";
    } else if (data.useMosaicAverage){
        midRegionText = "Mid:Average, ";
    } else {
        midRegionText = "";
    }
    if (isTargetAfterRef === null){
        joinText = "Replace/Update Region";
    } else if (isHorizontal){
        if (isTargetAfterRef){
            joinText = "Join [Top:Reference image, " + midRegionText + "Bottom:Target image]";
        } else {
            joinText = "Join [Top:Target image, " + midRegionText + "Bottom:Reference image]";
        }
    } else {
        if (isTargetAfterRef){
            joinText = "Join [Left:Reference image, " + midRegionText + "Right:Target image]";
        } else {
            joinText = "Join [Left:Target image, " + midRegionText + "Right:Reference image]";
        }   
    }
    
    let joinSizeSizer = new HorizontalSizer;
    joinSizeSizer.spacing = 2;
    joinSizeSizer.add(joinSize_Control, 100);
    joinSizeSizer.add(joinSizeResetControl, 0);
    joinSizeSizer.addStretch(0);
    
    let joinPositionSizer = new HorizontalSizer;
    joinPositionSizer.spacing = 2;
    joinPositionSizer.add(joinPosition_Control, 100);
    joinPositionSizer.add(joinPositionResetControl, 0);
    joinPositionSizer.addStretch(0);
    
    let joinPositionSection = new Control(this);
    joinPositionSection.sizer = new VerticalSizer;
    joinPositionSection.sizer.spacing = 2;
    joinPositionSection.sizer.add(joinPositionSizer);
    joinPositionSection.sizer.add(joinSizeSizer);
    let joinPositionBar = new SectionBar(this, joinText);
    joinPositionBar.setSection(joinPositionSection);
    joinPositionBar.onToggleSection = this.onToggleSection;
    controlsHeight += joinPositionBar.height + 5;
    if (!joinPosition_Control.enabled){
        joinPositionSection.hide();
    } else {
        controlsHeight += joinSize_Control.height;
        controlsHeight += joinPosition_Control.height;
    }

    // Global sizer
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 2;
    this.sizer.spacing = 2;
    this.sizer.add(previewControl);
    this.sizer.add(joinPositionBar);
    this.sizer.add(joinPositionSection);
    this.sizer.add(previewControl.getButtonSizer());

    controlsHeight += this.sizer.spacing * 3 + this.sizer.margin * 2;

    // The PreviewControl size is determined by the size of the bitmap
    // The dialog must also leave enough room for the extra controls we are adding
    this.userResizable = true;
    let preferredWidth = previewControl.width + this.sizer.margin * 2 + this.logicalPixelsToPhysical(20);
    let preferredHeight = previewControl.height + previewControl.getButtonSizerHeight() +
            controlsHeight + this.logicalPixelsToPhysical(20);
    this.resize(preferredWidth, preferredHeight);
    setTitle();
    update();
}

}
