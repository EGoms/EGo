/* global StdIcon.Error, StdButton.Ok, STAR_BKG_DELTA, UndoFlag.NoSwapFile */


/**
 * @param {Image} image
 * @returns {Rect} Bounding box of non zero pixels
 */
function getBoundingBox(image){
    const width = image.width;
    const height = image.height;
    const nChannels = image.isColor ? 3 : 1;
    let startP = image.maximumPosition();
    let x0 = 0;
    let x1 = image.width;
    let y0 = 0;
    let y1 = image.height;

    let row = new Rect(width, 1);
    let col = new Rect(1, height);
    let rowBuffer = image.bitsPerSample === 64 ? new Float64Array(row.area) : new Float32Array(row.area);
    let colBuffer = image.bitsPerSample === 64 ? new Float64Array(col.area) : new Float32Array(col.area);
    
    // Find the approximate edges
    row.moveTo(0, startP.y);
    image.getSamples(rowBuffer, row);
    for (let x = startP.x; x >= 0; x--){
        if (!rowBuffer[x]){
            x0 = Math.min(x + 1, width);
            break;
        }
    }
    for (let x = startP.x; x < width; x++){
        if (!rowBuffer[x]){
            x1 = x;
            break;
        }
    }
    col.moveTo(startP.x, 0);
    image.getSamples(colBuffer, col);
    for (let y = startP.y; y >= 0; y--){
        if (!colBuffer[y]){
            y0 = Math.min(y + 1, height);
            break;
        }
    }
    for (let y = startP.y; y < height; y++){
        if (!colBuffer[y]){
            y1 = y;
            break;
        }
    }
    
    // Refine to accurate bounding box
    for (; y0 > 0; y0--){
        row.moveTo(0, y0 - 1);
        if (isBlack(image, rowBuffer, row, nChannels)){
            break;
        }
    }
    for (; y1 < height; y1++){
        row.moveTo(0, y1);
        if (isBlack(image, rowBuffer, row, nChannels)){
            break;
        }
    }
    
    for (; x0 > 0; x0--){
        col.moveTo(x0 - 1, 0);
        if (isBlack(image, colBuffer, col, nChannels)){
            break;
        }
    }
    for (; x1 < width; x1++){
        col.moveTo(x1, 0);
        if (isBlack(image, colBuffer, col, nChannels)){
            break;
        }
    }
    return new Rect(x0, y0, x1, y1); 
}

/**
 * @param {Image} image Target image
 * @param {TypedArray} buffer Samples in rect will be read into this buffer. 
 * @param {Rect} rect Rectangle that represents a single pixel row or column
 * @param {Number} nChannels 1 for B&W, 3 for color
 * @returns {Boolean} Return true if all pixels in rect are black
 */
function isBlack(image, buffer, rect, nChannels){
    image.getSamples(buffer, rect, 0);
    // fast check
    for (let i=0; i<buffer.length; i+=100){
        if (buffer[i])
            return false;
    }
    // Now check every sample
    for (let i=0; i<buffer.length; i++){
        if (buffer[i])
            return false;
    }
    for (let c=1; c<nChannels; c++){
        image.getSamples(buffer, rect, c);
        for (let i=0; i<buffer.length; i++){
            if (buffer[i])
                return false;
        }
    }
    return true;
}

/**
 * @param {Image} image Target image
 * @param {Rect} overlap Area of Interest Preview rectangle
 * @param {Number} nChannels 1 for B&W, 3 for color
 * @returns {Boolean} True if the target image is below the reference image
 */
function isImageBelowOverlap(image, overlap, nChannels){
    const height = image.height;
    let line = new Rect(overlap.x0, 0, overlap.x1, 1);
    let lineBuffer = image.bitsPerSample === 64 ? new Float64Array(line.area) : new Float32Array(line.area);
    for (let offset = 0; ;offset++){
        let y = overlap.y0 - offset;
        line.moveTo(overlap.x0, y);
        if (y === 0 || isBlack(image, lineBuffer, line, nChannels)){
            return true;
        }
        y = overlap.y1 + offset;
        line.moveTo(overlap.x0, y);
        if (y === height || isBlack(image, lineBuffer, line, nChannels)){
            return false;
        }
    }
}

/**
 * 
 * @param {Image} image Target image
 * @param {Rect} overlap Area of Interest Preview rectangle
 * @param {Number} nChannels 1 for B&W, 3 for color
 * @returns {Boolean} True if the target image is to right of the reference image
 */
function isImageRightOfOverlap(image, overlap, nChannels){
    const width = image.width;
    let line = new Rect(0, overlap.y0, 1, overlap.y1);
    let lineBuffer = image.bitsPerSample === 64 ? new Float64Array(line.area) : new Float32Array(line.area);
    for (let offset = 0; ;offset++){
        let x = overlap.x0 - offset;
        line.moveTo(x, overlap.y0);
        if (x === 0 || isBlack(image, lineBuffer, line, nChannels)){
            return true;
        }
        x = overlap.x1 + offset;
        line.moveTo(x, overlap.y0);
        if (x === width || isBlack(image, lineBuffer, line, nChannels)){
            return false;
        }
    }
}

/**
 * Extract the specified area from an image, convert it to colour, and apply an unlinked STF to it.
 * @param {Image} image
 * @param {Rect} imageRect
 * @returns {ImageWindow}
 */
function extractAndStretch (image, imageRect) {
    // Create a temporary view just big enough for the specified rectangle
    // Width, height, n channels, bitsPerSample, float, color, title
    let w = new ImageWindow(imageRect.width, imageRect.height, 3, 16, false, true, "OverlapImage");
    let view = w.mainView;
    
    let rect = new Rect(imageRect.width, imageRect.height);
    let samples = new Float32Array(imageRect.area);
    view.beginProcess(UndoFlag.NoSwapFile);
    if (image.isColor){
        for (let c = 0; c < 3; c++){
            image.getSamples(samples, imageRect, c);
            view.image.setSamples(samples, rect, c);
        }
    } else {
        image.getSamples(samples, imageRect, 0);
        view.image.setSamples(samples, rect, 0);
        view.image.setSamples(samples, rect, 1);
        view.image.setSamples(samples, rect, 2);
    }
    view.endProcess();

    STFAutoStretch(view, undefined, undefined, false);
    let stf = view.stf;
    var HT = new HistogramTransformation;
    HT.H = 
        [[stf[0][1], stf[0][0], stf[0][2], 0, 1],
        [stf[1][1], stf[1][0], stf[1][2], 0, 1],
        [stf[2][1], stf[2][0], stf[2][2], 0, 1],
        [0, 0.5, 1, 0, 1],
        [0, 0.5, 1, 0, 1]];
    HT.executeOn(view, false); // no swap file
    
    return w;
}
/**
 * Extract the overlap image from the supplied view.
 * The view is cropped to the overlap bounding box and an unlinked STF is applied.
 * Any pixels within this bounding box that are not part of the overlap are set to half intensity.
 * @param {Image} refImage The overlap image will be extracted from the image in this view.
 * @param {Image} tgtImage The overlap image will be extracted from the image in this view.
 * @param {Overlap} overlap 
 * @returns {RefBitmap, TgtBitmap} Images of the overlapping pixels
 */
function extractOverlapImage(refImage, tgtImage, overlap){
    /**
     * Get all the samples from the image that are within the area rectangle.
     * @param {Float32Array|Float64Array} refSamples Overlap area from refView (modified)
     * @param {Float32Array|Float64Array} tgtSamples Overlap area from tgtView (modified)
     * @param {Float32Array|Float64Array} mask If mask is zero, set samples to half intensity
     */
    function applyMask(refSamples, tgtSamples, mask) {
        for (let i = mask.length - 1; i > -1; i--) {
            if (mask[i] === 0) {
                let ref = refSamples[i];
                let tgt = tgtSamples[i];
                refSamples[i] = ref ? ref : tgt; // Reference overlay
                tgtSamples[i] = tgt ? tgt : ref; // Target overlay
            }
        }
    };
    
    let imageRect = overlap.overlapBox;
    let maskSamples = overlap.getOverlapMaskBuffer();
    if (maskSamples.length !== imageRect.width * imageRect.height){
        console.criticalln("PreviewControl extractOverlapImage error: mask does not match crop area.\n" +
                "Mask buffer length = " + maskSamples.length + 
                "\nCrop rectangle = " + imageRect);
        return null; // TODO should throw exception
    }
    
    let refSamples = new Float32Array(maskSamples.length);
    let tgtSamples = new Float32Array(maskSamples.length);
    let rect = new Rect(imageRect.width, imageRect.height);
    
    let w1 = extractAndStretch(refImage, imageRect);
    let w2 = extractAndStretch(tgtImage, imageRect);
    let refView = w1.mainView;
    let tgtView = w2.mainView;

    refView.beginProcess(UndoFlag.NoSwapFile);
    tgtView.beginProcess(UndoFlag.NoSwapFile);
    let bitmapRect = refView.image.bounds;
    for (let c = 0; c < 3; c++){
        refView.image.getSamples(refSamples, bitmapRect, c);
        tgtView.image.getSamples(tgtSamples, bitmapRect, c);
        applyMask(refSamples, tgtSamples, maskSamples);
        refView.image.setSamples(refSamples, rect, c);
        tgtView.image.setSamples(tgtSamples, rect, c);
    }
    refView.endProcess();
    tgtView.endProcess();
    let refBitmap = refView.image.render();
    let tgtBitmap = tgtView.image.render();
    w1.purge();
    w1.close();
    w2.purge();
    w2.close();
    return {refBitmap: refBitmap, tgtBitmap: tgtBitmap};
}

/**
 * @param {Graphics} g
 * @param {Point[]} points
 * @param {Number} xOffset
 * @param {Number} yOffset 
 */
function drawPolyline(g, points, xOffset, yOffset){
    for (let i=1; i < points.length; i++){
        let x = points[i-1].x - xOffset;
        let y = points[i-1].y - yOffset;
        let x2 = points[i].x - xOffset;
        let y2 = points[i].y - yOffset;
        g.drawLine(x, y, x2, y2);
    }
}

/**
 * @param {PhotometricMosaicData} data 
 * @param {View} refView
 * @param {View} tgtView
 */
function Overlap(data, refView, tgtView){
    let refImage = refView.image;
    let tgtImage = tgtView.image;
    // Please treat as read only outside this class
    /** {Rect} overlapMask bounding box */
    this.overlapBox = null;
    /** {Rect} refBox Reference image bounding box */
    this.refBox = getBoundingBox(refImage);
    /** {Rect} tgtBox Target image bounding box */
    this.tgtBox = getBoundingBox(tgtImage);
    /** Bitmap of reference overlap region */
    this.refBitmap = null;
    /** Bitmap of target overlap region */
    this.tgtBitmap = null;
    
    /** {TypedArray} bitmap array from overlapBox. A value of 1 indicates were ref & tgt images overlap */
    let overlapMaskBuffer_;
    /** True if refBox and TgtBox intersect */
    let hasOverlapFlag_ = false;
    /** {Image} Mask of overlapping pixels. */
    let fullOverlapMask_;
    /** {Image} Mask of overlapping pixels. Mask is same size as overlap box. */
    let overlapMask_;
    /** {Image} Mask used with StarDetector */
    let starDetectMask_;
    /** Arrays storing min & max coordinates of non zero pixels */
    let minOutlineAtX_;
    let maxOutlineAtX_;
    let minOutlineAtY_;
    let maxOutlineAtY_;
    
    let self = this;
    
    /**
     * Construct object
     * @param {Rect} refBox
     * @param {Rect} tgtBox
     */
    function construct(refBox, tgtBox){
        if (!refBox.intersects(tgtBox)){
            hasOverlapFlag_ = false;
            return;
        }
        hasOverlapFlag_ = true;
        let result = calculateOverlapBox(refImage, tgtImage, refBox, tgtBox);
        self.overlapBox = result.overlapBox;
        overlapMaskBuffer_ = result.overlapMaskBuffer;
        
        let bitmaps = extractOverlapImage(refImage, tgtImage, self);
        self.refBitmap = bitmaps.refBitmap;
        self.tgtBitmap = bitmaps.tgtBitmap;
    }
    
    /**
     * Help the garbage collector to recover memory
     */
    this.clear = function(){
        if (self.refBitmap){
            self.refBitmap.clear();
            self.refBitmap = null;
        }
        if (self.tgtBitmap){
            self.tgtBitmap.clear();
            self.tgtBitmap = null;
        }
        refImage = null;
        tgtImage = null;
        overlapMaskBuffer_ = null;
        if (fullOverlapMask_){
            fullOverlapMask_.free();
            fullOverlapMask_ = null;
        }
        if (overlapMask_){
            overlapMask_.free();
            overlapMask_ = null;
        }
        if (starDetectMask_){
            starDetectMask_.free();
            starDetectMask_ = null;
        }
        hasOverlapFlag_ = null;
        minOutlineAtX_ = undefined;
        maxOutlineAtX_ = undefined;
        minOutlineAtY_ = undefined;
        maxOutlineAtY_ = undefined;
    };
    
    /**
     * @returns {Boolean} True if the reference and target images overlap
     */
    this.hasOverlap = function(){
        return hasOverlapFlag_;
    };
    
    this.isHorizontalJoin = function(){
        if (data.useJoinOrientationAuto){
            return self.overlapBox.width > self.overlapBox.height;
        } 
        return data.useJoinOrientationHorizontal;
    };
    
    this.tgtBoundingBoxIsOverlap = function(){
        return self.tgtBox.isEqualTo(self.overlapBox);
    };
    
    this.refBoundingBoxIsOverlap = function(){
        return self.refBox.isEqualTo(self.overlapBox);
    };
    
    /**
     * @returns {Float32Array|Float64Array}
     */
    this.getOverlapMaskBuffer = function(){
        return overlapMaskBuffer_;
    };
    
    /**
     * Create a mask image that is the same size as the reference image
     * Only the pixels within the overlapBox will be non zero.
     * @returns {Image}
     */
    this.getFullImageMask = function(){
        if (!fullOverlapMask_){
            fullOverlapMask_ = new Image(tgtImage.width, tgtImage.height, 1);
            fullOverlapMask_.fill(0);
            fullOverlapMask_.setSamples(this.getOverlapMaskBuffer(), this.overlapBox);
        }
        return fullOverlapMask_;
    };
    
    /**
     * Create a mask image for the overlapBox.
     * The image is the same size as the overlapBox.
     * @returns {Image}
     */
    this.getOverlapMask = function(){
        if (!overlapMask_){
            overlapMask_ = new Image(this.overlapBox.width, this.overlapBox.height, 1);
            overlapMask_.setSamples(this.getOverlapMaskBuffer());
        }
        return overlapMask_;
    };
    
    /**
     * Creates a path that follows the horizontal line if it is within the 
     * overlapping pixels. If it is above the overlap, it follows the top outline
     * of the overlap. If below, the bottom outline.
     * @param {Number} yCoord Specifies horizontal line y = yCoord
     * @returns {Point[]} The horizontal path constrained by the overlap
     */
    this.calcHorizOutlinePath = function(yCoord){
        let minOutlineAtX = self.getTopOutline();
        let maxOutlineAtX = self.getBottomOutline();
        let path = new Array(minOutlineAtX.length);
        for (let i=0; i<path.length; i++){
            if (yCoord < minOutlineAtX[i].y){
                // horizontal line is above top outline so use top outline
                path[i] = new Point(minOutlineAtX[i]);
            } else if (yCoord > maxOutlineAtX[i].y){
                // horizontal line is below bottom outline so use bottom outline
                path[i] = new Point(maxOutlineAtX[i]);
            } else {
                // Horizontal line is inside overlap so use horizontal line
                path[i] = new Point(minOutlineAtX[i].x, yCoord);
            }
        }
        return path;
    };
    
    /**
     * Creates a path that follows the vertical line if it is within the 
     * overlapping pixels. If it is left of the overlap, it follows the left outline
     * of the overlap. If right, the right outline.
     * @param {Number} xCoord Specifies vertical line x = xCoord
     * @returns {Point[]} The vertical path constrained by the overlap
     */
    this.calcVerticalOutlinePath = function(xCoord){
        let minOutlineAtY = self.getLeftOutline();
        let maxOutlineAtY = self.getRightOutline();
        let path = new Array(minOutlineAtY.length);
        for (let i=0; i<path.length; i++){
            if (xCoord < minOutlineAtY[i].x){
                // vertical line is left of left outline so use left outline
                path[i] = new Point(minOutlineAtY[i]);
            } else if (xCoord > maxOutlineAtY[i].x){
                // vertical line is right of right outline so use right outline
                path[i] = new Point(maxOutlineAtY[i]);
            } else {
                // vertical line is inside overlap so use vertical line
                path[i] = new Point(xCoord, minOutlineAtY[i].y);
            }
        }
        return path;
    };
    
    /**
     * Returns an inflated overlapBox that does not exceed the image (0, 0, width, height)
     * @returns {Rect}
     */
    this.getStarOverlapBox = function (){
        let inflateBy = getStarOverlapBorderSize();
        let box = self.overlapBox.inflatedBy(inflateBy);
        if (box.x0 < 0){
            box.x0 = 0;
        }
        if (box.y0 < 0){
            box.y0 = 0;
        }
        if (box.x1 > refImage.width){
            box.x1 = refImage.width;
        }
        if (box.y1 > refImage.height){
            box.y1 = refImage.height;
        }
        return box;
    };
    
    /**
     * @returns {Number} The amount to inflate the overlap region by to create the StarOverlap
     */
    function getStarOverlapBorderSize(){
        let inflateBy = Math.round(calcDefaultTargetGrowthLimit(data));
        return Math.max(20, inflateBy);
    }
    
    /**
     * Create a mask used to limit the star detection area.
     * The mask is larger than the overlap. We need stars that are close to the
     * overlap because their scattered light may affect the overlap region.
     * @param {Number} margin Avoid detecting stars within this boundary margin
     * @returns {Image}
     */
    function createStarDetectMask(margin){
        let starOverlapBox = self.getStarOverlapBox();
        let inflateBy = getStarOverlapBorderSize();
        let overlapBox = self.overlapBox;
        // Calculate the overlapBox rectangle in starOverlapBox coordinates
        let x0 = overlapBox.x0 - starOverlapBox.x0;
        let y0 = overlapBox.y0 - starOverlapBox.y0;
        let x1 = x0 + overlapBox.width;
        let y1 = y0 + overlapBox.height;
        let area = new Rect(x0, y0, x1, y1);
        // Copy the overlap mask into the starDetectMask
        let starDetectMask = new Image(starOverlapBox.width, starOverlapBox.height, 1);
        starDetectMask.fill(0);
        starDetectMask.setSamples(self.getOverlapMaskBuffer(), area);
            
        // Add the vertical dilation.
        // Loop around image with a 1 pixel wide column.
        let colLen = starOverlapBox.height;
        let colBuffer = new Float32Array(colLen);
        let colRect = new Rect(1, colLen);
        const BLACK = 0;
        for (let col = 0; col < overlapBox.width; col++){
            colRect.moveTo(x0 + col, 0);
            starDetectMask.getSamples(colBuffer, colRect);
            // Read one pixel past end of overlap box
            let readLimit = Math.min(y0 + overlapBox.height + 1, colLen);
            let previous = BLACK;
            for (let y = y0; y < readLimit; y++){
                if (colBuffer[y] !== previous){
                    if (colBuffer[y]){
                        // Entered white zone. Dilate towards top.
                        let start = Math.max(0, y - inflateBy);
                        for (let i = start; i < y; i++){
                            colBuffer[i] = 1;
                        }
                        previous = 1;
                    } else {
                        // Entered black zone. Dilate towards bottom.
                        let end = Math.min(colLen, y + inflateBy);
                        for (; y < end; y++){
                            colBuffer[y] = 1;
                        }
                        // Set previous to the next pixel
                        // If the next pixel is white, the dilation filled a gap.
                        // If the next pixel is black, the dilation has finished.
                        if (y < colLen){
                            previous = colBuffer[y];
                        }
                    }
                }
            }
            // Add margin at top
            let max = Math.min(margin, colBuffer.length);
            for (let j = 0; j<max; j++){
                colBuffer[j] = 0;
            }
            // Add margin at bottom
            let min = Math.max(0, colBuffer.length - margin);
            for (let j = min; j < colBuffer.length; j++){
                colBuffer[j] = 0;
            }
            starDetectMask.setSamples(colBuffer, colRect);
        }
        
        // Add the horizontal dilation.
        // Loop around image with a 1 pixel high row.
        // Since the columns have now been vertically dilated we must process the
        // whole height of the starOverlapBox. However, we only need to process
        // the overlapBox width.
        let rowLen = starOverlapBox.width;
        let rowBuffer = new Float32Array(rowLen);
        let rowRect = new Rect(rowLen, 1);
        for (let row = 0; row < starOverlapBox.height; row++){
            rowRect.moveTo(0, row);
            starDetectMask.getSamples(rowBuffer, rowRect);
            // Read one pixel past end of overlap box
            let readLimit = Math.min(x0 + overlapBox.width + 1, rowLen);
            let previous = BLACK;
            for (let x = x0; x < readLimit; x++){
                if (rowBuffer[x] !== previous){
                    if (rowBuffer[x]){
                        // Entered white zone. Dilate to left.
                        let start = Math.max(0, x - inflateBy);
                        for (let i = start; i < x; i++){
                            rowBuffer[i] = 1;
                        }
                        previous = 1;
                    } else {
                        // Entered black zone. Dilate to right.
                        let end = Math.min(rowLen, x + inflateBy);
                        for (; x < end; x++){
                            rowBuffer[x] = 1;
                        }
                        // Set previous to the next pixel
                        // If the next pixel is white, the dilation filled a gap.
                        // If the next pixel is black, the dilation has finished.
                        if (x < rowLen){
                            previous = rowBuffer[x];
                        } 
                    }
                }
            }
            // Add margin on left
            let max = Math.min(margin, rowBuffer.length);
            for (let j = 0; j<max; j++){
                rowBuffer[j] = 0;
            }
            // Add margin on right
            let min = Math.max(0, rowBuffer.length - margin);
            for (let j = min; j < rowBuffer.length; j++){
                rowBuffer[j] = 0;
            }
            starDetectMask.setSamples(rowBuffer, rowRect);
        }
        CoreApplication.processEvents();       
//        let testWindow = new ImageWindow(starOverlapBox.width, starOverlapBox.height, 1, 32, true, false, "StarDetectMask");
//        testWindow.mainView.beginProcess(UndoFlag.NoSwapFile);
//        let testView = testWindow.mainView;
//        testView.image.assign(starDetectMask);
//        testView.endProcess();
//        testWindow.show();
//        testWindow.zoomToFit();      
        return starDetectMask;
    }
    
    /**
     * Create a mask used to limit the star detection area.
     * The mask is larger than the overlap. We need stars that are close to the
     * overlap because their scattered light may affect the overlap region.
     * @returns {Image}
     */
    this.getStarDetectMask = function (){
        if (!starDetectMask_){
            starDetectMask_ = createStarDetectMask(STAR_BKG_DELTA + 1);
        }
        return starDetectMask_;
    };
    
    /**
     * @param {Image} refImage
     * @param {Image} tgtImage
     * @param {Rect} refBox Bounding box of non zero area
     * @param {Rect} tgtBox Bounding box of non zero area
     * @returns {overlapBox: overlapBox, overlapMaskBuffer: overlapMaskBuffer}
     */
    function calculateOverlapBox(refImage, tgtImage, refBox, tgtBox){
        // intersectBox will be equal to or larger than the overlap region.
        // For example, if the images are fatter outside the overlap
        const intersectBox = refBox.intersection(tgtBox);
        const xMin = intersectBox.x0;
        const xMax = intersectBox.x1;
        const yMin = intersectBox.y0;
        const yMax = intersectBox.y1;  
        const width = intersectBox.width;

        // Overlap bounding box coordinates
        let x0 = Number.POSITIVE_INFINITY;
        let x1 = Number.NEGATIVE_INFINITY;
        let y0 = Number.POSITIVE_INFINITY;
        let y1 = Number.NEGATIVE_INFINITY;

        // Create a mask to restrict the star detection to the overlapping area and previewArea
        const bufLen = intersectBox.area;
        let refBuffer = [];
        let tgtBuffer = [];
        const nChannels = refImage.isColor ? 3 : 1;
        for (let c=0; c<nChannels; c++){
            refBuffer[c] = refImage.bitsPerSample === 64 ? new Float64Array(bufLen) : new Float32Array(bufLen);
            tgtBuffer[c] = tgtImage.bitsPerSample === 64 ? new Float64Array(bufLen) : new Float32Array(bufLen);
            refImage.getSamples(refBuffer[c], intersectBox, c);
            tgtImage.getSamples(tgtBuffer[c], intersectBox, c);
        }
        let maskBuffer = new Float32Array(bufLen);

        for (let i=0; i<bufLen; i++){
            let isOverlap = true;
            for (let c = nChannels - 1; c > -1; c--) {
                if (tgtBuffer[c][i] === 0 || refBuffer[c][i] === 0) {
                    isOverlap = false;
                    break;
                }
            }
            if (isOverlap) {
                maskBuffer[i] = 1;
                // Determine bounding box
                let y = Math.floor(i/width);
                let x = i % width;
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
        // x1 and y1 both need to be just after the last pixel (x1 - x0 = width)
        x1++;
        y1++;

        // We have the mask buffer in terms of the intersection box.
        // We need it in terms of the overlapBox
        let overlapMaskBuffer = new Float32Array((x1 - x0) * (y1 - y0));
        let i = 0;
        for (let y = y0; y < y1; y++){
            let yXwidth = y * width;
            for (let x = x0; x < x1; x++){
                overlapMaskBuffer[i++] = maskBuffer[yXwidth + x];
            }
        }

        x0 += intersectBox.x0;
        x1 += intersectBox.x0;
        y0 += intersectBox.y0;
        y1 += intersectBox.y0;
        let overlapBox = new Rect(x0, y0, x1, y1);
        return {overlapBox: overlapBox, overlapMaskBuffer: overlapMaskBuffer};
    }
    
    /**
     * Calculates and stores the overlap pixel horizontal outline.
     * minOutlineAtX_ stores points for the top side of the outline.
     * maxOutlineAtX_ stores points for the bottom side of the outline.
     * The stored (x,y) coordinates are image coordinates.
     * The index of the array is the nth x pixel for the local overlap region
     * (i.e. index 0 corresponds to the left most point of the overlap bounding box).
     * For each local value of x, the image x, and minimum, maximum values of y are stored.
     */
    function calculateOutlineAtX(){
        let overlapBox = self.overlapBox;
        // Get local overlap coordinates of outline
        let w = overlapBox.width;
        let h = overlapBox.height;
        let x0 = overlapBox.x0;
        let y0 = overlapBox.y0;
        minOutlineAtX_ = new Array(w);
        maxOutlineAtX_ = new Array(w);
        for (let x=0; x<w; x++){
            for (let y=0; y<h; y++){
                let i = y * w + x;
                if (overlapMaskBuffer_[i]){
                    minOutlineAtX_[x] = new Point(x + x0, y + y0);
                    break;
                }
            }
            for (let y = h - 1; y >= 0; y--){
                let i = y * w + x;
                if (overlapMaskBuffer_[i]){
                    maxOutlineAtX_[x] = new Point(x + x0, y + y0);
                    break;
                }
            }
        }
        // Bridge any gaps
        interpolatePoints(minOutlineAtX_, false);
        interpolatePoints(maxOutlineAtX_, false);
    }
    
    /**
     * Calculates and stores the overlap pixel vertical outline.
     * minOutlineAtY_ stores points for the left side of the outline.
     * maxOutlineAtY_ stores points for the right side of the outline.
     * The stored (x,y) coordinates are image coordinates.
     * The index of the array is the nth x pixel for the local overlap region
     * (i.e. index 0 corresponds to the upper most point of the overlap bounding box).
     * For each local value of y, the image minimum, maximum values of x, and the image y are stored.
     */
    function calculateOutlineAtY(){
        let overlapBox = self.overlapBox;
        let w = overlapBox.width;
        let h = overlapBox.height;
        let x0 = overlapBox.x0;
        let y0 = overlapBox.y0;
        minOutlineAtY_ = new Array(h);
        maxOutlineAtY_ = new Array(h);
        for (let y=0; y<h; y++){
            let yXw = y * w;
            for (let x=0; x<w; x++){
                let i = yXw + x;
                if (overlapMaskBuffer_[i]){
                    minOutlineAtY_[y] = new Point(x + x0, y + y0);
                    break;
                }
            }
            for (let x = w - 1; x >= 0; x--){
                let i = yXw + x;
                if (overlapMaskBuffer_[i]){
                    maxOutlineAtY_[y] = new Point(x + x0, y + y0);
                    break;
                }
            }
        }
        // Bridge any gaps
        interpolatePoints(minOutlineAtY_, true);
        interpolatePoints(maxOutlineAtY_, true);
    }
    
    /**
     * If any array entries are undefined, fill them with interpolated points.
     * The first and last array entries must be defined.
     * @param {Point[]} points
     * @param {Boolean} isVertical
     */
    function interpolatePoints(points, isVertical){
        for (let i=1; i<points.length; i++){
            if (!points[i]){
                let previous = points[i-1];
                let next;
                // Found one or more undefined points
                let j=i+1;
                for (; j<points.length; j++){
                    if (points[j]){
                        next = points[j];
                        break;
                    }
                }
                if (previous && next){
                    if (isVertical){
                        // swap axis to avoid infinite gradient
                        let m = eqnOfLineCalcGradient(previous.y, previous.x, next.y, next.x);
                        let b = eqnOfLineCalcYIntercept(previous.y, previous.x, m);
                        let y = previous.y;
                        for (; i<j; i++){
                            // swap axis back
                            let x = Math.round(eqnOfLineCalcY(++y, m, b));
                            points[i] = new Point(x, y);
                        }
                    } else {
                        let m = eqnOfLineCalcGradient(previous.x, previous.y, next.x, next.y);
                        let b = eqnOfLineCalcYIntercept(previous.x, previous.y, m);
                        let x = previous.x;
                        for (; i<j; i++){
                            let y = Math.round(eqnOfLineCalcY(++x, m, b));
                            points[i] = new Point(x, y);
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Gets the overlap pixel horizontal outline for the top side of the overlapping pixels.
     * Usage: Point[x] = (X, Y)
     * x is the x coordinate relative to the overlapBox
     * (X,Y) is a point relative to the full image, and is a point on the top side of the overlap.
     * @return {Point[]} overlap top outline
     */
    this.getTopOutline = function (){
        if (!minOutlineAtX_){
            calculateOutlineAtX();
        }
        return minOutlineAtX_;
    };
    
    /**
     * Gets the overlap pixel horizontal outline for the bottom side of the overlapping pixels.
     * Usage: Point[x] = (X, Y)
     * x is the x coordinate relative to the overlapBox
     * (X,Y) is a point relative to the full image, and is a point on the bottom side of the overlap.
     * @return {Point[]} overlap bottom outline
     */
    this.getBottomOutline = function (){
        if (!maxOutlineAtX_){
            calculateOutlineAtX();
        }
        return maxOutlineAtX_;
    };
    
    /**
     * Gets the overlap pixel vertical outline for the left side of the overlapping pixels.
     * Usage: Point[y] = (X, Y)
     * y is the y coordinate relative to the overlapBox
     * (X,Y) is a point relative to the full image, and is a point on the left side of the overlap.
     * @return {Point[]} overlap left hand outline
     */
    this.getLeftOutline = function(){
        if (!minOutlineAtY_){
            calculateOutlineAtY();
        }
        return minOutlineAtY_;
    };
    
    /**
     * Gets the overlap pixel vertical outline for the right side of the overlapping pixels.
     * Usage: Point[y] = (X, Y)
     * y is the y coordinate relative to the overlapBox
     * (X,Y) is a point relative to the full image, and is a point on the right side of the overlap.
     * @return {Point[]} overlap right hand outline
     */
    this.getRightOutline = function(){
        if (!maxOutlineAtY_){
            calculateOutlineAtY();
        }
        return maxOutlineAtY_;
    };
    
    /**
     * Draw overlap outline into a bitmap
     * @param {Graphics} graphics Created from the bitmap to be drawn into
     * @param {Number} bitmapOffsetX Offset from image (0,0) and bitmap top left corner
     * @param {Number} bitmapOffsetY Offset from image (0,0) and bitmap top left corner
     */
    this.drawOverlapOutline = function (graphics, bitmapOffsetX, bitmapOffsetY){
        let firstSide, secondSide;
        if (self.overlapBox.width > self.overlapBox.height){
            firstSide = self.getTopOutline();
            secondSide = self.getBottomOutline();
        } else {
            firstSide = self.getLeftOutline();
            secondSide = self.getRightOutline();
        }
        drawPolyline(graphics, firstSide, bitmapOffsetX, bitmapOffsetY);
        drawPolyline(graphics, secondSide, bitmapOffsetX, bitmapOffsetY);
    };
    
    construct(this.refBox, this.tgtBox);
}

/**
 * Creates a JoinRegion.
 * Updates data.joinSize to be less than or equal to overlap thickness
 * @param {PhotometricMosaicData} data
 */
function JoinRegion(data){
    let overlapBox = data.cache.overlap.overlapBox;
    let isHorizontal = data.cache.overlap.isHorizontalJoin();
    let totalRange = isHorizontal ? overlapBox.height : overlapBox.width;
    let overlapMid = Math.floor((totalRange - 1)/2);
    let join = overlapMid + data.joinPosition;
    let self = this;
    
    function calcJoinRect(){
        if (data.useCropTargetToReplaceRegion) {
            let cropAreaPreview = data.cropTargetPreviewRect;
            if (!cropAreaPreview.intersects(overlapBox)){
                self.joinRect = null;
                self.errMsg = "<p>'Replace/Update Region' error.</p>" +
                    "<p>The specified area<br />" + cropAreaPreview + 
                    "<br /><br />does not intersect with the image overlap<br />" + 
                    overlapBox + "</p>";
                return;
            }
            self.joinRect = cropAreaPreview.intersection(overlapBox);
        } else {
            self.joinRect = new Rect(overlapBox);
        }
    }
    
    calcJoinRect();
    
    /**
     * @returns {Boolean}
     */
    this.isJoinHorizontal = function(){
        return isHorizontal;
    };
    
    this.getJoinPositionRange = function(){
        return {min: -overlapMid, max: overlapMid};
    };
    
    /**
     * @returns {Number} Join position in image coordinates
     */
    this.getJoin = function(){
        if (isHorizontal){
            return overlapBox.y0 + join;
        }
        return overlapBox.x0 + join;
    };
    
}