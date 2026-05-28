/* global UndoFlag.NoSwapFile, Dialog, StdButton.No, StdIcon.Question, StdButton.Cancel, StdButton.Yes, adjustScaleHelpText, DEFAULT_TARGET_GRADIENT_SMOOTHNESS, DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS */

//"use strict";

/**
 * Create a dialog that displays a graph.
 * The Graph object returned from the supplied createZoomedGradientGraph(Number zoomFactor) 
 * function must include the methods:
 * Bitmap Graph.getGraphBitmap()
 * String Graph.screenToWorld(Number x, Number y)
 * The GraphDialog is initialised with the Graph returned from createZoomedGradientGraph, 
 * with a zoom factor of 1
 * @param {String} title Window title
 * @param {PhotometricMosaicData} data
 * @param {Boolean} isColor
 * @param {Graph function({Number} zoomFactor, {Number} width, {Number} height, {Number} channel)} createZoomedGradientGraph
 * Callback function used to create a zoomed graph
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @param {Boolean} isAdjustScaleDialog If true, specialise dialog for adjust scale
 * @returns {GradientGraphDialog}
 */
class GradientGraphDialog extends Dialog
{
constructor(title, data, isColor, createZoomedGradientGraph, 
        photometricMosaicDialog, isAdjustScaleDialog)
{
super();
    let self = this;
    let zoom_ = 1;
    let selectedChannel_ = 3;
    let createZoomedGradientGraph_ = createZoomedGradientGraph;
    let graphHeight = data.smallScreen ? data.graphHeight - 300 : data.graphHeight;
    let width = this.logicalPixelsToPhysical(data.graphWidth);
    let height = this.logicalPixelsToPhysical(graphHeight);
    let graph_ = createZoomedGradientGraph_(zoom_, width, height, selectedChannel_);
    let displayingGraph = !isAdjustScaleDialog;
    let gradientPath_ = calcGradientPath(isAdjustScaleDialog);
    
    function calcGradientPath(isAdjustScaleDialog){
        let overlap = data.cache.overlap;
        let overlapBox = overlap.overlapBox;
        let isHorizontal = overlap.isHorizontalJoin();
        if (isAdjustScaleDialog){
            if (isHorizontal){
                let y = Math.floor(overlapBox.height / 2.0) + overlapBox.y0 + data.adjustScaleLineOffset;
                return overlap.calcHorizOutlinePath(y);
            }
            // Vertical
            let x = Math.floor(overlapBox.width / 2.0) + overlapBox.x0 + data.adjustScaleLineOffset;
            return overlap.calcVerticalOutlinePath(x);
        }
        // normal dialog
        let joinRegion = new JoinRegion(data);
        return createTaperPath(data.cache.overlap, joinRegion.getJoin(), isHorizontal);
    }
    /**
     * Converts bitmap (x,y) into graph coordinates.
     * @param {Number} x Bitmap x coordinate
     * @param {Number} y Bitmap y coordinate
     * @returns {String} Output string in format "( x, y )"
     */
    function displayXY(x, y){
        let xyString;
        if (displayingGraph){
            xyString = graph_.screenToWorld(x, y);
        } else {
            let overlapBox = data.cache.overlap.overlapBox;
            let imageScale = calcImageScale();
            let ix = overlapBox.x0 + Math.round((x - imageScale.dx)/imageScale.scale);
            let iy = overlapBox.y0 + Math.round((y - imageScale.dy)/imageScale.scale);
            xyString = "(" + ix + "," + iy + ")";
        }
        self.windowTitle = title + getZoomString() + "  " + xyString;
    };
    
    function calcImageScale(){
        let overlap = data.cache.overlap;
        let scaleX = (bitmapControl.width - 4) / overlap.refBitmap.width;
        let scaleY = (bitmapControl.height - 4) / overlap.refBitmap.height;
        let scale = Math.min(scaleX, scaleY);
        let dx = Math.round((bitmapControl.width - overlap.refBitmap.width * scale) / 2);
        let dy = Math.round((bitmapControl.height - overlap.refBitmap.height * scale) / 2);
        return {scale: scale, dx: dx, dy: dy};
    }
    
    // Draw bitmap into this component
    let bitmapControl = new Control(this);
    
    bitmapControl.onPaint = function (){
        let g;
        try {
            g = new Graphics(bitmapControl);
            g.clipRect = new Rect(0, 0, bitmapControl.width, bitmapControl.height);
            if (displayingGraph){
                g.drawBitmap(0, 0, graph_.getGraphBitmap());
            } else {
                let overlap = data.cache.overlap;
                let overlapBox = overlap.overlapBox;
                let imageScale = calcImageScale();
                g.fillRect(0, 0, bitmapControl.width, bitmapControl.height, new Brush());
                g.translateTransformation( imageScale.dx, imageScale.dy );
                g.scaleTransformation( imageScale.scale );
                g.drawBitmap(0, 0, overlap.refBitmap);
                g.antialiasing = false;
                g.pen = new Pen(0xff000000, 0);
                data.cache.overlap.drawOverlapOutline(g, overlapBox.x0, overlapBox.y0);
                g.pen = new Pen(0xff00ff00, 0.0);
                drawPolyline(g, gradientPath_, overlapBox.x0, overlapBox.y0);
            }
        } catch (e) {
            console.criticalln("GradientGraphDialog bitmapControl.onPaint() error: " + e);
        } finally {
            g.end();
        }
    };
    
    bitmapControl.onMouseDoubleClick = function ( clickX, clickY, buttonState, modifiers ){
        if (!displayingGraph && isAdjustScaleDialog){
            let imageScale = calcImageScale();
            let x = Math.round((clickX - imageScale.dx)/imageScale.scale);
            let y = Math.round((clickY - imageScale.dy)/imageScale.scale);
            
            let overlap = data.cache.overlap;
            let overlapBox = overlap.overlapBox;
            let isHorizontal = overlap.isHorizontalJoin();
            if (isHorizontal){
                data.adjustScaleLineOffset = Math.round(y - overlapBox.height / 2);   
            } else {
                data.adjustScaleLineOffset = Math.round(x - overlapBox.width / 2);
            }
            data.adjustScaleLineOffset = Math.min(data.adjustScaleLineOffset, gradientPath_Control.upperBound);
            data.adjustScaleLineOffset = Math.max(data.adjustScaleLineOffset, gradientPath_Control.lowerBound);
            gradientPath_Control.setValue(data.adjustScaleLineOffset);
            gradientPath_ = calcGradientPath(isAdjustScaleDialog);
            update(bitmapControl.width, bitmapControl.height);
        }
    };
    
    bitmapControl.onMousePress = function ( x, y, button, buttonState, modifiers ){
        // Display graph coordinates in title bar
        displayXY(x, y);
    };
    
    bitmapControl.onMouseMove = function ( x, y, buttonState, modifiers ){
        // When dragging mouse, display graph coordinates in title bar
        displayXY(x, y);
        // TODO create pan mode using space bar (modifiers = 8)
    };
    
    bitmapControl.onMouseWheel = function ( x, y, delta, buttonState, modifiers ){
        if (displayingGraph){
            if (delta < 0){
                updateZoom( zoom_ + 1);
            } else {
                updateZoom( zoom_ - 1);
            }
        }
    };
    
    bitmapControl.onResize = function (wNew, hNew, wOld, hOld) {
        update(wNew, hNew);
    };
    
    /**
     * @param {Number} zoom
     */
    function updateZoom (zoom) {
        if (zoom < 101 && zoom > -99){
            zoom_ = zoom;
            update(bitmapControl.width, bitmapControl.height);
            self.windowTitle = title + getZoomString();   // display zoom factor in title bar
        }
    }
    
    /**
     * @param {Number} width Graph bitmap width (
     * @param {Number} height Graph bitmap height
     */
    function update(width, height){
        try {
            if (displayingGraph){
                graph_ = createZoomedGradientGraph_(getZoomFactor(), width, height, selectedChannel_);
            }
            bitmapControl.repaint();    // display the zoomed graph bitmap
        } catch (e) {
            console.criticalln("Graph update error: " + e);
        }
    }
    
    /**
     * If zoom_ is positive, return zoom_ (1 to 100)
     * If zoom_ is zero or negative, then:
     * 0 -> 1/2
     * -1 -> 1/3
     * -2 -> 1/4
     * -98 -> 1/100
     * @returns {Number} Zoom factor
     */
    function getZoomFactor(){
        return zoom_ > 0 ? zoom_ : 1 / (2 - zoom_);
    }
    
    /**
     * @returns {String} Zoom string (e.g. " 1:2")
     */
    function getZoomString(){
        let zoomFactor = getZoomFactor();
        if (zoomFactor < 1){
            return " 1:" + Math.round(1/zoomFactor);
        } else {
            return " " + zoomFactor + ":1";
        }
    }
    
    bitmapControl.toolTip = "Left click: Display (x,y) in title bar";
    
    /**
     * When a slider is dragged, only fast draw operations are performed.
     * When the drag has finished (or after the user has finished editing in the textbox)
     * this method is called to perform all calculations.
     */
    function finalUpdateFunction(){
        self.enabled = false;
        CoreApplication.processEvents();
        update(bitmapControl.width, bitmapControl.height);
        self.enabled = true;
    }
    
    let image_CheckBox;
    let smoothnessControl;
    let gradientSmoothnessResetControl;
    if (!isAdjustScaleDialog){
        // Gradient controls
        let gradientControls = new GradientControls();
        gradientSmoothnessResetControl = gradientControls.createSmoothnessResetControl(this);
        if (data.viewFlag === DISPLAY_TARGET_GRADIENT_GRAPH()){
            smoothnessControl = gradientControls.createTargetGradientSmoothnessControl(this, data, 0);
            smoothnessControl.onValueUpdated = function (value) {
                data.targetGradientSmoothness = value;
                photometricMosaicDialog.targetGradientSmoothness_Control.setValue(value);
            };
            gradientSmoothnessResetControl.onClick = function(){
                data.targetGradientSmoothness = DEFAULT_TARGET_GRADIENT_SMOOTHNESS;
                smoothnessControl.setValue(data.targetGradientSmoothness);
                photometricMosaicDialog.targetGradientSmoothness_Control.setValue(data.targetGradientSmoothness);
                finalUpdateFunction();
            };
        } else {
            smoothnessControl = gradientControls.createOverlapGradientSmoothnessControl(this, data, 0);
            smoothnessControl.onValueUpdated = function (value) {
                data.overlapGradientSmoothness = value;
                photometricMosaicDialog.overlapGradientSmoothness_Control.setValue(value);
            }; 
            gradientSmoothnessResetControl.onClick = function(){
                data.overlapGradientSmoothness = DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS;
                smoothnessControl.setValue(data.overlapGradientSmoothness);
                photometricMosaicDialog.overlapGradientSmoothness_Control.setValue(data.overlapGradientSmoothness);
                finalUpdateFunction();
            };
        }
        smoothnessControl.slider.minWidth = 280;
        addFinalUpdateListener(smoothnessControl, finalUpdateFunction);
        
        image_CheckBox = new CheckBox(this);
        image_CheckBox.text = "Display image";
        image_CheckBox.toolTip = "<p>Display either the image or graph.</p>" +
                "<p>The line indicates the join position. The graph displays the " +
                "gradient along this line.</p>" +
                "<p>The circles indicate areas where gradient samples were " +
                "rejected due to their proximity to a bright star.</p>";
        image_CheckBox.checked = !displayingGraph;
        image_CheckBox.onClick = function (checked) {
            displayingGraph = !checked;
            redRadioButton.enabled = !checked && isColor;
            greenRadioButton.enabled = !checked && isColor;
            blueRadioButton.enabled = !checked && isColor;
            allRadioButton.enabled = !checked;
            smoothnessControl.enabled = !checked;
            zoomIn_Button.enabled = !checked;
            zoomOut_Button.enabled = !checked;
            if (checked){
                zoom_ = 1;
                self.windowTitle = title + getZoomString();   // display zoom factor in title bar
            }
            update(bitmapControl.width, bitmapControl.height);
        };
    }
    
    // ===========================
    // Color toggles
    // ===========================
    let redRadioButton = new RadioButton(this);
    redRadioButton.text = "Red";
    redRadioButton.toolTip = "<p>Display the red channel gradient</p>" + 
            "<p>This is only used to declutter the display. " +
            "The 'Smoothness' setting will be applied to all color channels.</p>";
    redRadioButton.checked = false;
    redRadioButton.onClick = function (checked) {
        selectedChannel_ = 0;
        enableControls();
        self.enabled = false;
        CoreApplication.processEvents();
        update(bitmapControl.width, bitmapControl.height);
        self.enabled = true;
    };
    
    let greenRadioButton = new RadioButton(this);
    greenRadioButton.text = "Green";
    greenRadioButton.toolTip = "<p>Display the green channel gradient</p>" + 
            "<p>This is only used to declutter the display. " +
            "The 'Smoothness' setting will be applied to all color channels.</p>";
    greenRadioButton.checked = false;
    greenRadioButton.onClick = function (checked) {
        selectedChannel_ = 1;
        enableControls();
        self.enabled = false;
        CoreApplication.processEvents();
        update(bitmapControl.width, bitmapControl.height);
        self.enabled = true;
    };
    
    let blueRadioButton = new RadioButton(this);
    blueRadioButton.text = "Blue";
    blueRadioButton.toolTip = "<p>Display the blue channel gradient</p>" + 
            "<p>This is only used to declutter the display. " +
            "The 'Smoothness' setting will be applied to all color channels.</p>";
    blueRadioButton.checked = false;
    blueRadioButton.onClick = function (checked) {
        selectedChannel_ = 2;
        enableControls();
        self.enabled = false;
        CoreApplication.processEvents();
        update(bitmapControl.width, bitmapControl.height);
        self.enabled = true;
    };
    
    let allRadioButton = new RadioButton(this);
    allRadioButton.text = "All";
    allRadioButton.toolTip = "Display the gradient for all channels";
    allRadioButton.checked = true;
    allRadioButton.onClick = function (checked) {
        selectedChannel_ = 3;
        enableControls();
        self.enabled = false;
        CoreApplication.processEvents();
        update(bitmapControl.width, bitmapControl.height);
        self.enabled = true;
    };
    
    if (!isColor){
        redRadioButton.enabled = false;
        greenRadioButton.enabled = false;
        blueRadioButton.enabled = false;
    }

    let optionsSizer = new HorizontalSizer(this);
    optionsSizer.margin = 0;
    optionsSizer.spacing = 10;
    optionsSizer.addSpacing(4);
    if (!isAdjustScaleDialog){
        optionsSizer.add(image_CheckBox);
        optionsSizer.addSpacing(20);
    }
    optionsSizer.add(redRadioButton);
    optionsSizer.add(greenRadioButton);
    optionsSizer.add(blueRadioButton);
    optionsSizer.add(allRadioButton);
    optionsSizer.addStretch();
    
    // ===========================
    // Adjust scale controls
    // ===========================
    let controlsHeight = 0;
    let minHeight = bitmapControl.minHeight;
    const POSITION_STRLEN = this.font.width("Position (+/-): ");
    const GREEN_STRLEN = this.font.width("Green: ");
    
    this.onToggleSection = function(bar, beginToggle){
        if (beginToggle){
            if (bar.isExpanded()){
                bitmapControl.setMinHeight(bitmapControl.height + bar.section.height + 2);
            } else {
                bitmapControl.setMinHeight(bitmapControl.height - bar.section.height - 2);
            }
            this.adjustToContents();
        }  else {
            bitmapControl.setMinHeight(minHeight);
            let maxDialogHeight = self.logicalPixelsToPhysical(1150);
            if (self.height > maxDialogHeight)
                self.resize(self.width, maxDialogHeight);
        }
    };
    
    let gradientPath_Control;
    let adjustRedScale_Control;
    let adjustGreenScale_Control;
    let adjustBlueScale_Control;
    
    function createGradientPathSection(dialog){
        let gradientPathControls = new GradientPathControls();
        gradientPath_Control = gradientPathControls.createGradientLineControl(
                dialog, data, POSITION_STRLEN);
        gradientPath_Control.onValueUpdated = function (value) {
            data.adjustScaleLineOffset = value;
            gradientPath_ = calcGradientPath(isAdjustScaleDialog);
            update(bitmapControl.width, bitmapControl.height);
        };
        addFinalUpdateListener(gradientPath_Control, finalUpdateFunction);
        controlsHeight += gradientPath_Control.height;
        
        let scaleSection = new Control(dialog);
        scaleSection.sizer = new VerticalSizer;
        scaleSection.sizer.add(gradientPath_Control);
        scaleSection.sizer.addSpacing(5);
        return scaleSection;
    }
    
    this.enableGradientPathDisplay = function(checked){
        self.enableScaleSection(!checked);
    };
    
    this.enableScaleSection = function(checked){
        self.scaleBar.checkBox.checked = checked;
        self.scaleSection.enabled = checked;
        self.gradientPathBar.checkBox.checked = !checked;
        self.gradientPathSection.enabled = !checked;
        
        displayingGraph = checked;
        redRadioButton.enabled = checked && isColor;
        greenRadioButton.enabled = checked && isColor;
        blueRadioButton.enabled = checked && isColor;
        allRadioButton.enabled = checked;
        
        zoomIn_Button.enabled = checked;
        zoomOut_Button.enabled = checked;
        if (!checked){
            zoom_ = 1;
            self.windowTitle = title + getZoomString();   // display zoom factor in title bar
        }
        update(bitmapControl.width, bitmapControl.height);
    };
    
    
    function createGradientPathBar(dialog, gradientPathSection){
        let gradientPathBar = new SectionBar(dialog, "Gradient Path");
        gradientPathBar.enableCheckBox();
        gradientPathBar.checkBox.checked = !displayingGraph;
        gradientPathBar.checkBox.onCheck = self.enableGradientPathDisplay;
        gradientPathBar.setSection(gradientPathSection);
        gradientPathBar.onToggleSection = dialog.onToggleSection;
        gradientPathBar.toolTip = adjustScaleHelpText;
        controlsHeight += gradientPathBar.height + gradientPathSection.sizer.spacing * 2 + 5;
        return gradientPathBar;
    }
    
    function createScaleSection(dialog){
        let adjustScaleControls = new AdjustScaleControls();
        adjustRedScale_Control = adjustScaleControls.createAdjustRedControl(
                dialog, data, GREEN_STRLEN);
        function onRedValueUpdated(value){
            data.adjustScale[0] = value;
            photometricMosaicDialog.adjustRedScale_Control.setValue(value);
            update(bitmapControl.width, bitmapControl.height);
        }
        adjustRedScale_Control.onValueUpdated = onRedValueUpdated;
        addFinalUpdateListener(adjustRedScale_Control, finalUpdateFunction);
        controlsHeight += adjustRedScale_Control.height;
        let adjustRedScaleReset_Control = adjustScaleControls.createScaleResetControl(dialog);
        adjustRedScaleReset_Control.onClick = function(){
            adjustRedScale_Control.setValue(1);
            onRedValueUpdated(1);
        };
        let redHorizSizer = new HorizontalSizer;
        redHorizSizer.spacing = 2;
        redHorizSizer.add(adjustRedScale_Control, 100);
        redHorizSizer.add(adjustRedScaleReset_Control, 0);
        
        adjustGreenScale_Control = adjustScaleControls.createAdjustGreenControl(
                dialog, data, GREEN_STRLEN);
        adjustGreenScale_Control.enabled = isColor;
        function onGreenValueUpdated(value){
            data.adjustScale[1] = value;
            photometricMosaicDialog.adjustGreenScale_Control.setValue(value);
            update(bitmapControl.width, bitmapControl.height);
        }
        adjustGreenScale_Control.onValueUpdated = onGreenValueUpdated;
        addFinalUpdateListener(adjustGreenScale_Control, finalUpdateFunction);
        controlsHeight += adjustGreenScale_Control.height;
        let adjustGreenScaleReset_Control = adjustScaleControls.createScaleResetControl(dialog);
        adjustGreenScaleReset_Control.onClick = function(){
            adjustGreenScale_Control.setValue(1);
            onGreenValueUpdated(1);
        };
        let greenHorizSizer = new HorizontalSizer;
        greenHorizSizer.spacing = 2;
        greenHorizSizer.add(adjustGreenScale_Control, 100);
        greenHorizSizer.add(adjustGreenScaleReset_Control, 0);

        adjustBlueScale_Control = adjustScaleControls.createAdjustBlueControl(
                dialog, data, GREEN_STRLEN);
        adjustBlueScale_Control.enabled = isColor;
        function onBlueValueUpdated(value){
            data.adjustScale[2] = value;
            photometricMosaicDialog.adjustBlueScale_Control.setValue(value);
            update(bitmapControl.width, bitmapControl.height);
        }
        adjustBlueScale_Control.onValueUpdated = onBlueValueUpdated;
        addFinalUpdateListener(adjustBlueScale_Control, finalUpdateFunction);
        controlsHeight += adjustBlueScale_Control.height;
        let adjustBlueScaleReset_Control = adjustScaleControls.createScaleResetControl(dialog);
        adjustBlueScaleReset_Control.onClick = function(){
            adjustBlueScale_Control.setValue(1);
            onBlueValueUpdated(1);
        };
        let blueHorizSizer = new HorizontalSizer;
        blueHorizSizer.spacing = 2;
        blueHorizSizer.add(adjustBlueScale_Control, 100);
        blueHorizSizer.add(adjustBlueScaleReset_Control, 0);
        
        let scaleSection = new Control(dialog);
        scaleSection.sizer = new VerticalSizer;
        scaleSection.sizer.spacing = 2;
        scaleSection.sizer.add(redHorizSizer);
        scaleSection.sizer.add(greenHorizSizer);
        scaleSection.sizer.add(blueHorizSizer);
        scaleSection.sizer.addSpacing(5);
        return scaleSection;
    }
    
    function createScaleBar(dialog, scaleSection){
        let scaleBar = new SectionBar(dialog, "Adjust Scale");
        scaleBar.enableCheckBox();
        scaleBar.checkBox.checked = displayingGraph;
        scaleBar.checkBox.onCheck = self.enableScaleSection;
        scaleBar.setSection(scaleSection);
        scaleBar.onToggleSection = dialog.onToggleSection;
        scaleBar.toolTip = adjustScaleHelpText;
        controlsHeight += scaleBar.height + scaleSection.sizer.spacing * 2 + 5;
        return scaleBar;
    }
    
    function enableControls(){
        if (isColor && isAdjustScaleDialog){
            adjustRedScale_Control.enabled = (selectedChannel_ === 0 || selectedChannel_ === 3);
            adjustGreenScale_Control.enabled = (selectedChannel_ === 1 || selectedChannel_ === 3);
            adjustBlueScale_Control.enabled = (selectedChannel_ === 2 || selectedChannel_ === 3);
        }
    }
    
    // ===========================
    // Zoom controls and OK button
    // ===========================
    let zoomIn_Button = new ToolButton(this);
    zoomIn_Button.icon = this.scaledResource(":/icons/zoom-in.png");
    zoomIn_Button.setScaledFixedSize(24, 24);
    zoomIn_Button.toolTip = "Zoom In";
    zoomIn_Button.onMousePress = function (){
        updateZoom( zoom_ + 1);
    };

    let zoomOut_Button = new ToolButton(this);
    zoomOut_Button.icon = this.scaledResource(":/icons/zoom-out.png");
    zoomOut_Button.setScaledFixedSize(24, 24);
    zoomOut_Button.toolTip = "Zoom Out";
    zoomOut_Button.onMousePress = function (){
        updateZoom( zoom_ - 1);
    };

    let zoom11_Button = new ToolButton(this);
    zoom11_Button.icon = this.scaledResource(":/icons/zoom-1-1.png");
    zoom11_Button.setScaledFixedSize(24, 24);
    zoom11_Button.toolTip = "Zoom 1:1";
    zoom11_Button.onMousePress = function (){
        updateZoom( 1 );
    };
    
    let ok_Button = new PushButton(this);
    ok_Button.text = "OK";
    ok_Button.icon = this.scaledResource( ":/icons/ok.png" );
    ok_Button.onClick = function(){
        self.ok();
    };

    let zoomButton_Sizer = new HorizontalSizer(this);
    zoomButton_Sizer.margin = 0;
    zoomButton_Sizer.spacing = 4;
    zoomButton_Sizer.add(zoomIn_Button);
    zoomButton_Sizer.add(zoomOut_Button);
    zoomButton_Sizer.add(zoom11_Button);
    zoomButton_Sizer.addStretch();
    zoomButton_Sizer.add(ok_Button);
    zoomButton_Sizer.addSpacing(10);
    
    //-------------
    // Global sizer
    //-------------
    this.sizer = new VerticalSizer(this);
    this.sizer.margin = 2;
    this.sizer.spacing = 2;
    this.sizer.add(bitmapControl, 100);
    this.sizer.add(optionsSizer);
    if (isAdjustScaleDialog){
        this.gradientPathSection = createGradientPathSection(this);
        this.gradientPathBar = createGradientPathBar(this, this.gradientPathSection);
        this.sizer.add(this.gradientPathBar);
        this.sizer.add(this.gradientPathSection);
        
        this.scaleSection = createScaleSection(this);
        this.scaleBar = createScaleBar(this, this.scaleSection);
        this.sizer.add(this.scaleBar);
        this.sizer.add(this.scaleSection);
        this.enableScaleSection(displayingGraph);
    } else {
        let horizontalSizer = new HorizontalSizer(this);
        horizontalSizer.addSpacing(2);
        horizontalSizer.add(smoothnessControl);
        horizontalSizer.add(gradientSmoothnessResetControl);
        horizontalSizer.addStretch();
        this.sizer.add(horizontalSizer);
    }
    this.sizer.add(zoomButton_Sizer);
    enableControls();
    
    this.userResizable = true;
    let preferredWidth = width + this.sizer.margin * 2;
    let preferredHeight = height + this.sizer.margin * 2 + this.sizer.spacing * 2 + 
           zoomIn_Button.height * 2 + 4;
    this.resize(preferredWidth, preferredHeight);
    
    this.setScaledMinSize(300, 300);
    this.windowTitle = title + " 1:1";
}

}