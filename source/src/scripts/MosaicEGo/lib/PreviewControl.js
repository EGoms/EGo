/* global Dialog, MouseButton_Left, Frame, KeyModifier_Control, MouseButton_Right, Bitmap */


//"use strict";

// the PreviewControl method is based on PreviewControl.js from the AnnotationImage script, 

/**
 * 
 * @param {UIObject} parent
 * @param {Bitmap} image image The unscaled bitmap to display. It is not modified.
 * @param {Number} maxWidth
 * @param {Number} maxHeight
 * @param {width:, height:} metadata Specifies dimensions of drawing region if image = null
 * @param {Function(HorizontalSizer)} customControls e.g. add 'Live update' and 'Update' controls
 * @param {Boolean} includeCancelButton If true, add a cancel button after the OK button
 * @returns {PreviewControl}
 */
class PreviewControl extends Frame
{
constructor(parent, image, maxWidth, maxHeight, metadata, customControls, includeCancelButton)
{
super(parent);
    
    let self = this;

    /**
     * Set the background image, or the drawing area if the image is null
     * @param {Bitmap} image The unscaled bitmap to display. It is not modified.
     * @param {width:, height:} metadata Specifies dimensions of drawing region if image = null
     */
    this.setImage = function (image, metadata) {
        if (metadata){
            this.metadata = metadata;
        } else {
            this.metadata = {width: image.width, height:image.height};
        }
        // The original bitmap at 1:1 scale
        this.image = image;
        // The zoomed bitmap, calculated from this.image
        this.scaledImage = null;
        // Set the lower zoom limit when the whole image is visible
        this.setZoomOutLimit();
        // This sets the inital zoom to 1:1. Use -100 to set to ZoomOutLimit
        this.updateZoom(1, null);
    };
    
    /**
     * Update the background image. The new image must be the same size as the
     * original image.
     * This also updates the scaled image. The scroll position and zoom level
     * are left unchanged.
     * @param {Bitmap} image
     */
    this.updateBitmap = function (image){
        if (image.width === this.image.width && image.height === this.image.height){
            this.image = image;
            if (this.scaledImage instanceof Bitmap){
                this.scaledImage.clear();
            }
            this.scaledImage = this.image.scaled(this.scale);
        } else {
            console.criticalln("PreviewControl error: bitmap size changed");
        }
    };

    /**
     * Update the zoom, constrained to the ZoomOutLimit. Max zoom = 4.
     * If newZoom > 0 and <= 4, scale = newZoom
     * If newZoom <= 0 and >= zoomOutLimit, scale = 1/(-newZoom + 2)
     * e.g. 2 -> 2, 1 -> 1, 0 -> 1/2, -1 -> 1/3
     * @param {Number} newZoom
     * @param {Point} refPoint Center zoom here (if null defaults to center of viewport).
     * refPoint is in local viewport coordinates
     */
    this.updateZoom = function (newZoom, refPoint) {
        try {
            newZoom = Math.max(this.zoomOutLimit, Math.min(4, newZoom));
            if (newZoom === this.zoom && this.scaledImage)
                return; // no change

            if (refPoint === null) // default to center
                refPoint = new Point(this.scrollbox.viewport.width / 2, this.scrollbox.viewport.height / 2);

            // imgx and imgy are in this.image coordinates (i.e. 1:1 scale)
            let imgx = null;
            if (this.scrollbox.maxHorizontalScrollPosition > 0)
                imgx = (refPoint.x + this.scrollbox.horizontalScrollPosition) / this.scale;

            let imgy = null;
            if (this.scrollbox.maxVerticalScrollPosition > 0)
                imgy = (refPoint.y + this.scrollbox.verticalScrollPosition) / this.scale;

            this.zoom = newZoom;
            this.scaledImage = null;

            // Calculate scale from zoom index. 
            // Update zoom text
            let zoomText;
            if (this.zoom > 0) {
                this.scale = this.zoom;
                zoomText = format("%d:1", this.zoom);
            } else {
                this.scale = 1 / (-this.zoom + 2);
                zoomText = format("1:%d", -this.zoom + 2);
            }
            if (this.updateZoomText){
                this.updateZoomText(zoomText);
            }

            if (this.image) {
                // Create zoomed image from the original bitmap
                this.scaledImage = this.image.scaled(this.scale);
            } else {
                // No bitmap image was supplied.
                // scaledImage will only contain the width and height
                this.scaledImage = {
                    width: this.metadata.width * this.scale,
                    height: this.metadata.height * this.scale
                };
            }

            this.scrollbox.maxHorizontalScrollPosition = Math.max(0, this.scaledImage.width - this.scrollbox.viewport.width);
            this.scrollbox.maxVerticalScrollPosition = Math.max(0, this.scaledImage.height - this.scrollbox.viewport.height);

            // Scroll to keep the refPoint in the correct place
            if (this.scrollbox.maxHorizontalScrollPosition > 0 && imgx !== null)
                this.scrollbox.horizontalScrollPosition = imgx * this.scale - refPoint.x;
            if (this.scrollbox.maxVerticalScrollPosition > 0 && imgy !== null)
                this.scrollbox.verticalScrollPosition = imgy * this.scale - refPoint.y;

            this.scrollbox.viewport.update();
        } catch(e){
            console.criticalln("PreviewControl updateZoom error: " + e);
        }
    };
    
    this.zoomIn_Button = new ToolButton(this);
    this.zoomIn_Button.icon = this.scaledResource(":/icons/zoom-in.png");
    this.zoomIn_Button.setScaledFixedSize(24, 24);
    this.zoomIn_Button.toolTip = "Zoom In";
    this.zoomIn_Button.onMousePress = function ()
    {
        self.updateZoom(self.zoom + 1, null);
    };

    this.zoomOut_Button = new ToolButton(this);
    this.zoomOut_Button.icon = this.scaledResource(":/icons/zoom-out.png");
    this.zoomOut_Button.setScaledFixedSize(24, 24);
    this.zoomOut_Button.toolTip = "Zoom Out";
    this.zoomOut_Button.onMousePress = function ()
    {
        self.updateZoom(self.zoom - 1, null);
    };

    this.zoom11_Button = new ToolButton(this);
    this.zoom11_Button.icon = this.scaledResource(":/icons/zoom-1-1.png");
    this.zoom11_Button.setScaledFixedSize(24, 24);
    this.zoom11_Button.toolTip = "Zoom 1:1";
    this.zoom11_Button.onMousePress = function ()
    {
        self.updateZoom(1, null);
    };

    this.zoom = 1;
    this.scale = 1;
    this.zoomOutLimit = -5;
    this.scrollbox = new ScrollBox(this);
    this.scrollbox.autoScroll = true;
    this.scrollbox.tracking = true;
    this.scrollbox.pageHeight = this.scrollbox.viewport.height;
    this.scrollbox.pageWidth = this.scrollbox.viewport.width;
    this.scrollbox.lineHeight = 10;
    this.scrollbox.lineWidth = 10;

    this.scroll_Sizer = new HorizontalSizer;
    this.scroll_Sizer.add(this.scrollbox);
    
    this.scrolling = null;

    /**
     * Prevents zoom out beyond the point where the whole image is visible
     */
    this.setZoomOutLimit = function () {
        let scaleX = Math.ceil(this.metadata.width / this.scrollbox.viewport.width);
        let scaleY = Math.ceil(this.metadata.height / this.scrollbox.viewport.height);
        let scale = Math.max(scaleX, scaleY);
        this.zoomOutLimit = -scale + 2;
    };

    this.scrollbox.onHorizontalScrollPosUpdated = function (newPos) {
        this.viewport.update();
    };

    this.scrollbox.onVerticalScrollPosUpdated = function (newPos) {
        this.viewport.update();
    };

    this.forceRedraw = function () {
        this.scrollbox.viewport.update();
    };

    /**
     * Mouse wheel zoom
     * @param {Number} x
     * @param {Number} y
     * @param {Number} delta
     * @param {Number} buttonState
     * @param {Number} modifiers
     */
    this.scrollbox.viewport.onMouseWheel = function (x, y, delta, buttonState, modifiers) {
        self.updateZoom(self.zoom + ((delta > 0) ? -1 : 1), new Point(x, y));
    };

    /**
     * Add a listener for a mouse click with modifiers:
     * MouseButton_Left, MouseButton_Right, MouseButton_Middle
     * KeyModifier_Shift, KeyModifier_Control, KeyModifier_Alt, KeyModifier_SpaceBar, KeyModifier_Meta
     * @param {Function(point, button, buttonState, modifiers)} listener
     */
    this.addCtrlClickListener = function (listener){
        self.ctrlClickListener = listener;
    };
    
    /**
     * Removes CtrlClickListener
     */
    this.removeCtrlClickListener = function (){
        self.ctrlClickListener = undefined;
    };
    
    /**
     * Add a listener for a mouse double click with modifiers:
     * MouseButton_Left, MouseButton_Right, MouseButton_Middle
     * KeyModifier_Shift, KeyModifier_Control, KeyModifier_Alt, KeyModifier_SpaceBar, KeyModifier_Meta
     * @param {Function(point, button, buttonState, modifiers)} listener
     */
    this.addDoubleClickListener = function (listener){
        self.doubleClickListener = listener;
    };
    
    /**
     * Removes doubleClickListener
     */
    this.removeDoubleClickListener = function (){
        self.doubleClickListener = undefined;
    };

    this.scrollbox.viewport.onMouseDoubleClick = function( x, y, buttonState, modifiers ){
        if (self.doubleClickListener){
            let coord = viewPortToBitmapXY(x, y, this.width, this.height);
            self.doubleClickListener(coord.x, coord.y, buttonState, modifiers);
        }
    };

    /**
     * If left mouse button press, start pan mode
     * @param {Number} x
     * @param {Number} y
     * @param {Number} button
     * @param {Number} buttonState
     * @param {Number} modifiers
     */
    this.scrollbox.viewport.onMousePress = function (x, y, button, buttonState, modifiers) {
        if (self.scrolling)
            return;
        
        if (modifiers === KeyModifier_Control && button === MouseButton_Left && 
                self.ctrlClickListener !== undefined){
            let coord = viewPortToBitmapXY(x, y, this.width, this.height);
            self.ctrlClickListener(coord, button, buttonState, modifiers);
            return;
        }
        
        if (button === MouseButton_Right)
            return;
        
        self.scrolling = {
            orgCursor: new Point(x, y),
            orgScroll: new Point(self.scrollbox.horizontalScrollPosition, self.scrollbox.verticalScrollPosition)
        };
        // Setting the cursor does not work. Don't know why.
        // this.cursor = new Cursor(StdCursor.ClosedHand);
    };

    function viewPortToBitmapXY(x, y, width, height){
        // (ox, oy) is the scaled image origin in viewport coordinates
        let ox = (self.scrollbox.maxHorizontalScrollPosition > 0) ?
                -self.scrollbox.horizontalScrollPosition : (width - self.scaledImage.width) / 2;
        let oy = (self.scrollbox.maxVerticalScrollPosition > 0) ?
                -self.scrollbox.verticalScrollPosition : (height - self.scaledImage.height) / 2;

        // coordPx is the cursor position in this.image bitmap coordinates
        return new Point((x - ox) / self.scale, (y - oy) / self.scale);
    }

    /**
     * Display cursor postion in image coordinates, if in pan mode scroll image.
     * @param {Number} x
     * @param {Number} y
     * @param {Number} buttonState
     * @param {Number} modifiers
     */
    this.scrollbox.viewport.onMouseMove = function (x, y, buttonState, modifiers) {
        if (self.scrolling) {
            self.scrollbox.horizontalScrollPosition = self.scrolling.orgScroll.x - (x - self.scrolling.orgCursor.x);
            self.scrollbox.verticalScrollPosition = self.scrolling.orgScroll.y - (y - self.scrolling.orgCursor.y);
        }

        if (self.updateCoord){
            let coordPx = viewPortToBitmapXY(x, y, this.width, this.height);
            if (coordPx.x < 0 ||
                    coordPx.x > self.metadata.width ||
                    coordPx.y < 0 ||
                    coordPx.y > self.metadata.height)
            {
                // cursor is not over the image
                self.updateCoord(null);
            } else {
                self.updateCoord(coordPx);
            }
        }
    };

    /**
     * On left mouse button release, if in pan mode update scroll position and exit pan mode
     * @param {Number} x
     * @param {Number} y
     * @param {Number} button
     * @param {Number} buttonState
     * @param {Number} modifiers
     */
    this.scrollbox.viewport.onMouseRelease = function (x, y, button, buttonState, modifiers) {
        if (self.scrolling && button !== MouseButton_Right) {
            self.scrollbox.horizontalScrollPosition = self.scrolling.orgScroll.x - (x - self.scrolling.orgCursor.x);
            self.scrollbox.verticalScrollPosition = self.scrolling.orgScroll.y - (y - self.scrolling.orgCursor.y);
            self.scrolling = null;
            // Setting the cursor does not work. Don't know why.
            // this.cursor = new Cursor(StdCursor.Arrow);
        }
    };

    /**
     * @param {Number} wNew New width
     * @param {Number} hNew New height
     * @param {Number} wOld old width
     * @param {Number} hOld old height
     */
    this.scrollbox.viewport.onResize = function (wNew, hNew, wOld, hOld) {
        try {
            if (self.scaledImage) {
                this.parent.maxHorizontalScrollPosition = Math.max(0, self.scaledImage.width - wNew);
                this.parent.maxVerticalScrollPosition = Math.max(0, self.scaledImage.height - hNew);
                this.parent.pageHeight = this.parent.viewport.height;
                this.parent.pageWidth = this.parent.viewport.width;
                self.setZoomOutLimit();
                self.updateZoom(self.zoom, null);
            }
            this.update();
        } catch(e){
            console.criticalln("PreviewControl onResize error: " + e);
        }
    };

    /**
     * @param {Number} x0 Viewport x0
     * @param {Number} y0 Viewport y0
     * @param {Number} x1 Viewport x1
     * @param {Number} y1 Viewport y1
     */
    this.scrollbox.viewport.onPaint = function (x0, y0, x1, y1) {
        let graphics;
        try {
            graphics = new Graphics(this);
            graphics.clipRect = new Rect(x0, y0, x1, y1);
            graphics.fillRect(x0, y0, x1, y1, new Brush(0xff202020));

            let translateX = (this.parent.maxHorizontalScrollPosition > 0) ?
                    -this.parent.horizontalScrollPosition : (this.width - self.scaledImage.width) / 2;
            let translateY = (this.parent.maxVerticalScrollPosition > 0) ?
                    -this.parent.verticalScrollPosition : (this.height - self.scaledImage.height) / 2;
            graphics.translateTransformation(translateX, translateY);

            if (self.image)
                graphics.drawBitmap(0, 0, self.scaledImage);
            else
                graphics.fillRect(0, 0, self.scaledImage.width, self.scaledImage.height, new Brush(0xff000000));

            if (self.onCustomPaint) {
                // Draw on top of the bitmap if onCustomPaint(...) method has been set
                self.onCustomPaint.call(self.onCustomPaintScope, 
                        this, translateX, translateY, self.scale, x0, y0, x1, y1);
            }
        } catch(e){
            console.criticalln("PreviewControl onPaint error: " + e);
        } finally {
            graphics.end();
        }
    };
    
    this.ok_Button = new PushButton();
    this.ok_Button.defaultButton = true;
    this.ok_Button.text = "OK";
    this.ok_Button.icon = this.scaledResource( ":/icons/ok.png" );
    
    this.cancel_Button = null;
    if (includeCancelButton){
        this.cancel_Button = new PushButton();
        this.cancel_Button.text = "Close";
        this.cancel_Button.icon = this.scaledResource( ":/icons/cancel.png" );
    }

    this.getButtonSizer = function(){
        let zoomButton_Sizer = new HorizontalSizer();
        zoomButton_Sizer.margin = 0;
        zoomButton_Sizer.spacing = 4;
        zoomButton_Sizer.add(this.zoomIn_Button);
        zoomButton_Sizer.add(this.zoomOut_Button);
        zoomButton_Sizer.add(this.zoom11_Button);
        if (customControls){
            customControls(zoomButton_Sizer);
        }
        zoomButton_Sizer.addStretch();
        zoomButton_Sizer.add(this.ok_Button);
        if (includeCancelButton){
            zoomButton_Sizer.add(this.cancel_Button);
        }
        zoomButton_Sizer.addSpacing(10);
        return zoomButton_Sizer;
    };
    this.getButtonSizerHeight = function(){
        return this.zoomIn_Button.height;
    };

    this.sizer = new VerticalSizer();
    this.sizer.add(this.scroll_Sizer);
    
    this.setImage(image, metadata);
    
    this.width = Math.min(this.logicalPixelsToPhysical(maxWidth), image.width);
    this.height = Math.min(this.logicalPixelsToPhysical(maxHeight), image.height);
}

}
