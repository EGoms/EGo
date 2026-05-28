/* global OVERLAY_REF, OVERLAY_TGT, OVERLAY_RND, OVERLAY_AVG, RND_NOISE_SIGMA */

//"use strict";

#define OVERLAY_REF 1
#define OVERLAY_TGT 2
#define OVERLAY_RND 3
#define OVERLAY_AVG 4

/**
 * Any sharp corners in the horizontal input path are 'cut' with a 45 degree line.
 * @param {Point[]} path
 * @returns {Point[]} Path with no slopes more than 45 degrees from horizontal or vertical
 */
function createSoftHorizontalPath(path){
    // Must avoid starting at path start or end incase it wraps around the overlap.
    // This would create a very large 45 degree segment.
    let startIdx = Math.floor(path.length / 2);
    let vPath = new Array(path.length);
    vPath[startIdx] = new Point(path[startIdx]);
    let lastPointY = vPath[startIdx].y;
    for (let i = startIdx - 1; i>=0; i--){
        let dif = path[i].y - lastPointY;
        if (dif > 0){
            lastPointY++;
        } else if (dif < 0){
            lastPointY--;
        }
        vPath[i] = new Point(path[i].x, lastPointY);
    }
    lastPointY = path[startIdx].y;
    for (let i = startIdx + 1; i<path.length; i++){
        let dif = path[i].y - lastPointY;
        if (dif > 0){
            lastPointY++;
        } else if (dif < 0){
            lastPointY--;
        }
        vPath[i] = new Point(path[i].x, lastPointY);
    }
    return vPath;
}

/**
 * Any sharp corners in the input path are 'cut' with a 45 degree line.
 * @param {Point[]} path
 * @returns {Point[]} Path with no slopes more than 45 degrees from horizontal or vertical
 */
function createSoftVerticalPath(path){
    // Must avoid starting at path start or end incase it wraps around the overlap.
    // This would create a very large 45 degree segment.
    let startIdx = Math.floor(path.length / 2);
    
    let vPath = new Array(path.length);
    vPath[startIdx] = new Point(path[startIdx]);
    let lastPointX = vPath[startIdx].x;
    for (let i = startIdx - 1; i>=0; i--){
        let dif = path[i].x - lastPointX;
        if (dif > 0){
            lastPointX++;
        } else if (dif < 0){
            lastPointX--;
        }
        vPath[i] = new Point(lastPointX, path[i].y);
    }
    lastPointX = path[startIdx].x;
    for (let i = startIdx + 1; i<path.length; i++){
        let dif = path[i].x - lastPointX;
        if (dif > 0){
            lastPointX++;
        } else if (dif < 0){
            lastPointX--;
        }
        vPath[i] = new Point(lastPointX, path[i].y);
    }
    return vPath;
}

/**
 * Creates a path along the target side of the join or overlap boundary with no sharp corners.
 * @param {Overlap} overlap
 * @param {Number} joinPosition 
 * @param {Boolean} isHorizontal 
 * @returns {Point[]} Path with no slopes more than 45 degrees from horizontal or vertical
 */
function createTaperPath(overlap, joinPosition, isHorizontal){
    let path;
    if (isHorizontal){
        path = overlap.calcHorizOutlinePath(joinPosition);
        return createSoftHorizontalPath(path);
    }
    // Must be vertical
    path = overlap.calcVerticalOutlinePath(joinPosition);
    return createSoftVerticalPath(path);
}

function createTaperEndPath(taperPath, taperLength, isHorizontal, isTargetAfterRef){
    let taperEndPath = [];
    let delta = isTargetAfterRef ? taperLength : -taperLength;
    for (let i=0; i<taperPath.length; i++){
        if (isHorizontal){
            taperEndPath.push(new Point(taperPath[i].x, taperPath[i].y + delta));
        } else {
            taperEndPath.push(new Point(taperPath[i].x + delta, taperPath[i].y));
        }
    }
    return taperEndPath;
}

/**
 * Creates the reference side of the Average / Blend area
 * @param {Overlap} overlap
 * @param {Point[]} taperPath
 * @param {Number} percent Specifies margin on ref side compared to ref to join distance.
 * @param {Boolean} isHorizontal
 * @param {Boolean} isTargetAfterRef
 * @returns {Point[]}
 */
function createJoinAreaPath(overlap, taperPath, percent, isHorizontal, isTargetAfterRef){
    let fraction = percent / 100;
    let path;
    let sPath = new Array(taperPath.length);
    if (isHorizontal){
        // Horizontal
        let y;
        if (isTargetAfterRef){
            path = overlap.getTopOutline();
            let softPath = createSoftHorizontalPath(path);
            for (let i=0; i<path.length; i++){
                y = taperPath[i].y;
                if (softPath[i].y < taperPath[i].y){
                    y -= Math.round((taperPath[i].y - softPath[i].y) * fraction);
                }
                sPath[i] = new Point(path[i].x, y);
            }
        } else {
            path = overlap.getBottomOutline();
            let softPath = createSoftHorizontalPath(path);
            for (let i=0; i<path.length; i++){
                y = taperPath[i].y;
                if (softPath[i].y > taperPath[i].y){
                    y += Math.round((softPath[i].y - taperPath[i].y) * fraction);
                }
                sPath[i] = new Point(path[i].x, y);
            }
        }
    } else {
        // Vertical
        let x;
        if (isTargetAfterRef){
            path = overlap.getLeftOutline();
            let softPath = createSoftVerticalPath(path);
            for (let i=0; i<path.length; i++){
                x = taperPath[i].x;
                if (softPath[i].x < taperPath[i].x){
                    x -= Math.round((taperPath[i].x - softPath[i].x) * fraction);
                }
                sPath[i] = new Point(x, path[i].y);
            }
        } else {
            path = overlap.getRightOutline();
            let softPath = createSoftVerticalPath(path);
            for (let i=0; i<path.length; i++){
                x = taperPath[i].x;
                if (softPath[i].x > taperPath[i].x){
                    x += Math.round((softPath[i].x - taperPath[i].x) * fraction);
                }
                sPath[i] = new Point(x, path[i].y);
            }
        }
    }
    return sPath;
}

/**
 * Create difference array for the taper path
 * @param {SurfaceSpline} surfaceSpline
 * @param {Overlap} overlap 
 * @param {Number} joinPosition Join position in image coordinates
 * @param {Boolean} isHorizontal 
 * @returns {Number[]} Difference array from minX to maxX - 1
 */
function createSplineArray(surfaceSpline, overlap, joinPosition, isHorizontal){
    let points = createTaperPath(overlap, joinPosition, isHorizontal);
    return (surfaceSpline.evaluate(points)).toArray();
}

/**
 * Calculates a surface spline representing the difference between reference and target samples.
 * Represents the gradient in a single channel. (use 3 instances  for color images.)
 * @param {SamplePair[]} samplePairs median values from ref and tgt samples
 * @param {Number|undefined} logSmoothing Logarithmic value; larger values smooth more
 * @returns {SurfaceSpline}
 */
function calcSurfaceSpline(samplePairs, logSmoothing){
    const length = samplePairs.length;
    let xVector = new Vector(length);
    let yVector = new Vector(length);
    let zVector = new Vector(length);
    let wVector = new Vector(length);
    for (let i=0; i<length; i++){
        let samplePair = samplePairs[i];
        xVector.at(i, samplePair.rect.center.x);
        yVector.at(i, samplePair.rect.center.y);
        zVector.at(i, samplePair.getDifference());
        wVector.at(i, samplePair.weight);
    }
    
    let ss = new SurfaceSpline();
    if (logSmoothing !== undefined){
        ss.smoothing = Math.pow(10.0, logSmoothing);
    } else {
        ss.smoothing = 0;
    }
    CoreApplication.processEvents();
    ss.initialize(xVector, yVector, zVector, wVector);
    if (!ss.isValid){
        throw new function () {
            this.message = 'Invalid SurfaceSpline';
            this.name = 'SurfaceSplineInvalid';
        };
    }
    return ss;
}

/**
 * This class is used to apply the scale and gradient to the target image
 * @param {Overlap} overlap Represents the overlap region
 * @param {JoinRegion} joinRegion
 * @param {Boolean} isHorizontal If true, the join is horizontal (one image is above the other)
 * @param {PhotometricMosaicData} data 
 * @param {Boolean} isTargetAfterRef True if target image is below or right of reference image
 * @returns {ScaleAndGradientApplier}
 */
function ScaleAndGradientApplier(overlap, joinRegion, isHorizontal, data, isTargetAfterRef) {
            
    let m_overlapBox = overlap.overlapBox;
    // Calc start of reference overlay region
    let m_overlapMinPath;   // Top or left overlap outline
    let m_overlapMaxPath;   // Bottom or right overlap outline
        
    // 'First' coordinate of Ref overlay.
    // Target after ref: Ref side of overlap outline (m_overlapMinPath)
    // Ref after target: Ref side of Average/Blend area
    let m_refOverlayStartPath;
    
    // 'Last' coordinate of Ref overlay.
    // Target after ref: Ref side of Average/Blend area
    // Ref after target: Ref side of overlap outline (m_overlapMaxPath)
    let m_refOverlayEndPath;
    
    // 'First' coordinate of Tgt overlay
    // Target after ref: Tgt side of Average/Blend area
    // Ref after target: Taper path 
    let m_tgtOverlayStartPath;
    
    // 'Last' coordinate of Tgt overlay
    // Target after ref: Taper path
    // Ref after target: Tgt side of Average/Blend area
    let m_tgtOverlayEndPath;
    
    let m_taperPath = createTaperPath(overlap, joinRegion.getJoin(), isHorizontal);
    let m_taperEndPath = createTaperEndPath(m_taperPath, data.taperLength, isHorizontal, isTargetAfterRef);
    
    // Ref side of Average/Blend area
    let m_joinAreaPath;
    if (data.useMosaicAverage || data.useMosaicRandom){
        m_joinAreaPath = createJoinAreaPath(overlap, m_taperPath, data.joinSize, isHorizontal, isTargetAfterRef);
    } else {
        m_joinAreaPath = m_taperPath;
    }
    
    if (isHorizontal){
        m_overlapMinPath = overlap.getTopOutline();
        m_overlapMaxPath = overlap.getBottomOutline();
    } else {
        m_overlapMinPath = overlap.getLeftOutline();
        m_overlapMaxPath = overlap.getRightOutline();
    }
    
    let m_joinAreaStart;
    let m_joinAreaEnd;
    if (isTargetAfterRef){
        m_refOverlayStartPath = m_overlapMinPath;
        m_refOverlayEndPath = m_joinAreaPath;
        m_joinAreaStart = m_joinAreaPath;
        m_joinAreaEnd = m_taperPath;
        m_tgtOverlayStartPath = m_taperPath;
        m_tgtOverlayEndPath = m_taperPath;
    } else {
        m_tgtOverlayStartPath = m_taperPath;
        m_tgtOverlayEndPath = m_taperPath;
        m_joinAreaStart = m_taperPath;
        m_joinAreaEnd = m_joinAreaPath;
        m_refOverlayStartPath = m_joinAreaPath;
        m_refOverlayEndPath = m_overlapMaxPath;
    }
    
    /**
     * Applies the scale and gradient correction to the supplied view.
     * 
     * @param {View} refView Read access only
     * @param {View} tgtView Read access only
     * @param {View} view Blank image, will become mosaic image or corrected target image
     * @param {Number} scale
     * @param {SurfaceSpline} propagateSurfaceSpline
     * @param {SurfaceSpline} joinSurfaceSpline
     * @param {Number} channel
     * @returns {undefined}
     */
    this.applyAllCorrections = function (refView, tgtView, view, scale,
            propagateSurfaceSpline, joinSurfaceSpline, channel){
        CoreApplication.processEvents();
        let refImage = refView.image;
        let tgtImage = tgtView.image;
        let lastProgressPc;
        function progressCallback(count, total){
            if (count < 0){ // Reset
                console.write("<end>   0%");
                lastProgressPc = 0;
                CoreApplication.processEvents();
            } else {
                let pc = Math.round(100 * count / total);
                if (pc > lastProgressPc && (pc > lastProgressPc + 5 || pc === 100)){
                    console.write(format("\b\b\b\b%3d%%", pc));
                    lastProgressPc = pc;
                    CoreApplication.processEvents();
                }
            }
        }
        
        function SurfaceSplinePoints(){
            let self = this;
            this.indexs = [];
            this.points = [];
            this.zVector = null;
            this.addPoint = function (i, x, y){
                this.indexs.push(i);
                this.points.push(new Point(x, y));
            };
            this.clear = function(){
                this.indexs = [];
                this.points = [];
            };
            /**
             * Evaluate the surface spline for this.points. this.zVector stores results.
             * @param {SurfaceSpline} surfaceSpline
             * @returns {Vector} z axis difference values
             */
            this.evaluate = function(surfaceSpline){
                self.zVector = surfaceSpline.evaluate(self.points);
            };
            /**
            * Apply the z difference values stored in zVector to the supplied typed array
            * @param {TypedArray} outSamples Apply the z difference to this array
            */
            this.apply = function(outSamples){
                let length = self.points.length;
                // For each non zero target pixel in samples[]
                for (let i=0; i<length; i++){
                    // This is a tgt pixel that is non zero. Correct the offset.
                    let idx = self.indexs[i];
                    outSamples[idx] -= self.zVector.at(i);
                }
            };
        };
        
        let outputImage = view.image;
        let outLength = Math.max(outputImage.height, outputImage.width);
        let refSamples = refImage.bitsPerSample === 64 ? new Float64Array(outLength) : new Float32Array(outLength);
        let tgtSamples = tgtImage.bitsPerSample === 64 ? new Float64Array(outLength) : new Float32Array(outLength);
        let outSamples = tgtImage.bitsPerSample === 64 ? new Float64Array(outLength) : new Float32Array(outLength);
        let maskSamples = new Float32Array(outLength);
        
        if (isTargetAfterRef === null){
            let joinRect = joinRegion.joinRect;
            let m_joinMinPath;
            let m_joinMaxPath;
            if (isHorizontal){
                m_joinMinPath = overlap.calcHorizOutlinePath(joinRect.y0);
                m_joinMaxPath = overlap.calcHorizOutlinePath(joinRect.y1);
            } else {
                m_joinMinPath = overlap.calcVerticalOutlinePath(joinRect.x0);
                m_joinMaxPath = overlap.calcVerticalOutlinePath(joinRect.x1);
            }
            let maskImage;
            if (refView.window.maskEnabled && !refView.window.mask.isNull){
                let maskWindow = refView.window.mask;
                maskImage = maskWindow.mainView.image;
                console.noteln("Applying mask: ", maskWindow.mainView.fullId);
            }
            console.write("Replace/Update Region [", channel, "]");
            // Insert mode
            // Full correction from start of join up to end of the join region
            if (isHorizontal){
                let progressLimit = joinRect.x1 - joinRect.x0 - 1;
                progressCallback(-1, m_overlapBox.width - 1);
                for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                    let x0 = m_joinMinPath[xIdx].x;
                    if (x0 >= joinRect.x0 && x0 < joinRect.x1){
                        // Create columns (width = 1 pixel) that start and stop at the 
                        // top and bottom overlap boundary 
                        let y0 = m_joinMinPath[xIdx].y;
                        let y1 = m_joinMaxPath[xIdx].y;
                        if (y1 > y0){
                            let column = new Rect(x0, y0, x0 + 1, y1);
                            applyTgtOverlayLine(isHorizontal, column, x0, y0, maskImage);
                        }
                        progressCallback(x0 - joinRect.x0, progressLimit);
                    }
                }
            } else {
                // Vertical
                let progressLimit = joinRect.y1 - joinRect.y0 - 1;
                progressCallback(-1, m_overlapBox.height - 1);
                for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                    // Create rows (width = 1 pixel) that start and stop at the 
                    // left and right edges of the overlap boundary
                    let y0 = m_joinMinPath[yIdx].y;
                    if (y0 >= joinRect.y0 && y0 < joinRect.y1){
                        let x0 = m_joinMinPath[yIdx].x;
                        let x1 = m_joinMaxPath[yIdx].x;
                        if (x1 > x0){
                            let row = new Rect(x0, y0, x1, y0 + 1);
                            applyTgtOverlayLine(isHorizontal, row, x0, y0, maskImage);
                        }
                        progressCallback(y0 - joinRect.y0, progressLimit);
                    }
                }
            }
            console.writeln();
            return;
        }
        
        if (isHorizontal){
            let leftX0 = overlap.refBox.x0;
            let leftX1 = m_overlapBox.x0;
            let rightX0 = m_overlapBox.x1;
            let rightX1 = overlap.refBox.x1;
            let leftY0, leftY1, rightY0, rightY1;
            if (isTargetAfterRef){
                // Clear reference left and right of the overlap bounding box, after joinRect. 
                leftY0 = m_taperPath[0].y;
                rightY0 = m_taperPath[m_taperPath.length - 1].y;
                leftY1 = overlap.refBox.y1;
                rightY1 = overlap.refBox.y1;
            } else {
                // Clear reference left and right of the overlap bounding box, before joinRect. 
                leftY0 = overlap.refBox.y0;
                rightY0 = overlap.refBox.y0;
                leftY1 = m_taperPath[0].y;
                rightY1 = m_taperPath[m_taperPath.length - 1].y;
            }
            if (leftX0 < leftX1 && leftY0 < leftY1){
                outputImage.fill(0, new Rect(leftX0, leftY0, leftX1, leftY1), channel, channel);
            }
            if (rightX0 < rightX1 && rightY0 < rightY1){
                outputImage.fill(0, new Rect(rightX0, rightY0, rightX1, rightY1), channel, channel);
            }
        } else {
            let topY0 = overlap.refBox.y0;
            let topY1 = m_overlapBox.y0;
            let botY0 = m_overlapBox.y1;
            let botY1 = overlap.refBox.y1;
            let topX0, topX1, botX0, botX1;
            if (isTargetAfterRef){
                // Clear reference top and bottom of the overlap bounding box, after joinRect. 
                topX0 = m_taperPath[0].x;
                botX0 = m_taperPath[m_taperPath.length - 1].x;
                topX1 = overlap.refBox.x1;
                botX1 = overlap.refBox.x1;
            } else {
                // Clear reference top and bottom of the overlap bounding box, before joinRect. 
                topX0 = overlap.refBox.x0;
                botX0 = overlap.refBox.x0;
                topX1 = m_taperPath[0].x;
                botX1 = m_taperPath[m_taperPath.length - 1].x;
            }
            
            if (topY0 < topY1 && topX0 < topX1){
                outputImage.fill(0, new Rect(topX0, topY0, topX1, topY1), channel, channel);
            }
            if (botY0 < botY1 && botX0 < botX1){
                outputImage.fill(0, new Rect(botX0, botY0, botX1, botY1), channel, channel);
            }
        }

        // ===========================================================================
        // Reference Overlay from start of overlap boundary to start of join rectangle
        // ===========================================================================
        /**
         * @param {Boolean} isHorizontal
         * @param {Rect} line Rectangle represents row or column, 1 pixel thick
         * @param {Number} x0
         * @param {Number} y0
         * @return {SurfaceSlinePoints} Contains the differences between the target and reference.
         */
        function applyRefOverlayLine(isHorizontal, line, x0, y0){
            let lineLength = line.area;
            // ref overlay from overlap boundary to join
            refImage.getSamples(refSamples, line, channel);
            tgtImage.getSamples(tgtSamples, line, channel);
            let surfaceSplinePoints = new SurfaceSplinePoints();
            for (let idx=0; idx < lineLength; idx++){
                if (refSamples[idx]){
                    outSamples[idx] = refSamples[idx];
                } else {
                    outSamples[idx] = tgtSamples[idx] * scale;
                    if (isHorizontal){
                        surfaceSplinePoints.addPoint(idx, x0, y0 + idx); // offset removed later
                    } else {
                        surfaceSplinePoints.addPoint(idx, x0 + idx, y0); // offset removed later
                    }
                }
            }
            // Remove the surfaceSpline offsets
            if (surfaceSplinePoints.points.length > 0){
                surfaceSplinePoints.evaluate(joinSurfaceSpline);
                surfaceSplinePoints.apply(outSamples);
                outputImage.setSamples( outSamples, line, channel );
            }
            return surfaceSplinePoints;
        }
        // The reference samples either side of the overlap already exist in the output image.
        // The target samples on either side do not get added here.
        // To do a complete job would require a vertical band which tapers to the target model
        function applyRefOverlayHorizontal(){
            progressCallback(-1, m_overlapBox.width - 1);
            for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                // Apply to a column (width = 1 pixel)
                let y0 = m_refOverlayStartPath[xIdx].y;
                let y1 = m_refOverlayEndPath[xIdx].y;
                if (y1 > y0){
                    let x0 = m_refOverlayStartPath[xIdx].x;
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    applyRefOverlayLine(true, column, x0, y0);
                    progressCallback(xIdx, m_overlapBox.width - 1);
                }
            }
        }
        // The reference samples either side of the overlap already exist in the output image.
        // The target samples on either side do not get added here.
        // To do a complete job would require a horizontal band which tapers to the target model
        function applyRefOverlayVertical(){
            progressCallback(-1, m_overlapBox.height - 1);
            for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                // Apply to a row (height = 1 pixel)
                let x0 = m_refOverlayStartPath[yIdx].x;
                let x1 = m_refOverlayEndPath[yIdx].x;
                if (x1 > x0){
                    let y0 = m_refOverlayStartPath[yIdx].y;
                    let row = new Rect(x0, y0, x1, y0 + 1);
                    applyRefOverlayLine(false, row, x0, y0);
                    progressCallback(yIdx, m_overlapBox.height - 1);
                }
            }
        }
        
        console.write("Reference  [", channel, "]");
        if (isHorizontal){
            applyRefOverlayHorizontal();
        } else {
            applyRefOverlayVertical();
        }
        progressCallback(100, 100);
        console.writeln();
        
        // ===========================================================================
        // Join Area: Blend or Average
        // ===========================================================================
        function TgtLine (refImage, tgtImage, rect, channel){
            let self = this;
            this.line = rect;
            this.targetSamples    = tgtImage.bitsPerSample === 64 ? new Float64Array(rect.area) : new Float32Array(rect.area);
            this.referenceSamples = tgtImage.bitsPerSample === 64 ? new Float64Array(rect.area) : new Float32Array(rect.area);
            tgtImage.getSamples(this.targetSamples, this.line, channel);
            refImage.getSamples(this.referenceSamples, this.line, channel);
            
            function calcSurfaceSplinePoints(){
                let surfaceSplinePoints = new SurfaceSplinePoints();
                let lineLength = self.targetSamples.length;
                let targetSamples = self.targetSamples;
                let x0 = self.line.x0;
                let y0 = self.line.y0;
                for (let idx=0; idx < lineLength; idx++){
                    if (targetSamples[idx]){
                        if (isHorizontal){
                            surfaceSplinePoints.addPoint(idx, x0, y0 + idx); // offset removed later
                        } else {
                            surfaceSplinePoints.addPoint(idx, x0 + idx, y0); // offset removed later
                        }
                    }
                }
                return surfaceSplinePoints;
            }
            
            // Apply scale and offset correction to non zero target samples
            let surfaceSplinePoints = calcSurfaceSplinePoints();
            if (surfaceSplinePoints.points.length > 0){
                surfaceSplinePoints.evaluate(joinSurfaceSpline);
                let length = surfaceSplinePoints.points.length;
                for (let i=0; i<length; i++){
                    // This is a tgt pixel that is non zero. Correct the offset.
                    let index = surfaceSplinePoints.indexs[i];
                    this.targetSamples[index] = this.targetSamples[index] * scale - surfaceSplinePoints.zVector.at(i);
                }
            }
            surfaceSplinePoints.clear();
        }
        
        /**
         * @param {TgtLine} targetLines
         * @param {Number} percent Percentage of pixels to reject
         * @returns {Number} outlier limit
         */
        function calcOutlierLimit(targetLines, percent){
            let fraction = 1 - percent/100;
            let difArray = [];
            for (let nthLine=0; nthLine<targetLines.length; nthLine++){
                let targetLine = targetLines[nthLine];
                let targetSamples = targetLine.targetSamples;
                let referenceSamples = targetLine.referenceSamples;
                let lineLength = targetSamples.length;
                for (let index = 0; index < lineLength; index++){
                    if (referenceSamples[index] && targetSamples[index]){ 
                        difArray.push(Math.abs(targetSamples[index] - referenceSamples[index]));
                    }
                }
            }
            if (!difArray.length)
                return 0;
            
            difArray.sort(function (a, b) {  return a - b;  });
            let difLimitIndex = Math.floor((difArray.length - 1) * fraction);
            return difArray[difLimitIndex];
        }

        /**
         * @param {TgtLine[]} targetLines
         */
        function applyJoinArea(targetLines){
            function randomAlgorithm(targetSamples, referenceSamples, index, fractionDone){
                if (Math.random() > fractionDone){
                    targetSamples[index] = referenceSamples[index];
                    //targetSamples[index] = 0; // test
                }
            }
            function averageAlgorithm(targetSamples, referenceSamples, index, fractionDone){
                let refVal = (1 - fractionDone) * referenceSamples[index];
                let tgtVal = fractionDone * targetSamples[index];
                targetSamples[index] = refVal + tgtVal;
                //targetSamples[index] = 0; // test
            }
            let algorithm = data.useMosaicAverage ? averageAlgorithm : randomAlgorithm;
            
            let outlierLimit = calcOutlierLimit(targetLines, data.joinOutlierPercent);
            for (let nthLine=0; nthLine<targetLines.length; nthLine++){
                let targetLine = targetLines[nthLine];
                let targetSamples = targetLine.targetSamples;
                let referenceSamples = targetLine.referenceSamples;
                let lineLength = targetSamples.length;
                let allDone = lineLength > 1 ? lineLength - 1 : 1;
                for (let index = 0; index < lineLength; index++){
                    if (referenceSamples[index] && targetSamples[index]){
                        let fractionDone = isTargetAfterRef ? index/allDone : 1 - index/allDone;
                        if (Math.abs(targetSamples[index] - referenceSamples[index]) > outlierLimit){
                            // Probable star bloat or star missalignment. Choose ref or tgt.
                            if (fractionDone < 0.5){
                                // Closer to reference side
                                targetSamples[index] = referenceSamples[index];
                                //targetSamples[index] = 0; // test
                            }
                        } else {
                            // averageAlgorithm or randomAlgorithm
                            algorithm(targetSamples, referenceSamples, index, fractionDone);
                        } 
                    } else if (referenceSamples[index]){
                        targetSamples[index] = referenceSamples[index];
                    }
                }
                outputImage.setSamples( targetSamples, targetLine.line, channel );
            }
        }
        
        // The reference samples either side of the overlap already exist in the output image.
        // The target samples on either side do not get added here.
        // To do a complete job would require a vertical band which tapers to the target model
        function applyJoinAreaHorizontal(){
            progressCallback(-1, m_overlapBox.width - 1);
            let targetLines = [];
            for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                // Create columns (width = 1 pixel) that start and stop at the 
                // top and bottom overlap boundary 
                let y0 = m_joinAreaStart[xIdx].y;
                let y1 = m_joinAreaEnd[xIdx].y;
                if (y1 > y0){
                    let x0 = m_joinAreaStart[xIdx].x;
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    targetLines.push(new TgtLine(refImage, tgtImage, column, channel));
                    progressCallback(xIdx, m_overlapBox.width - 1);
                }
            }
            applyJoinArea(targetLines);
        }
        
        // The reference samples either side of the overlap already exist in the output image.
        // The target samples on either side do not get added here.
        // To do a complete job would require a vertical band which tapers to the target model
        function applyJoinAreaVertical(){
            progressCallback(-1, m_overlapBox.height - 1);
            let targetLines = [];
            for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                // Create rows (width = 1 pixel) that start and stop at the 
                // left and right edges of the overlap boundary 
                let x0 = m_joinAreaStart[yIdx].x;
                let x1 = m_joinAreaEnd[yIdx].x;
                if (x1 > x0){
                    let y0 = m_joinAreaStart[yIdx].y;
                    let row = new Rect(x0, y0, x1, y0 + 1);
                    targetLines.push(new TgtLine(refImage, tgtImage, row, channel));
                    progressCallback(yIdx, m_overlapBox.height - 1);
                }
            }
            applyJoinArea(targetLines);
        }
        
        if (data.useMosaicAverage || data.useMosaicRandom){
            console.write("Join Region[", channel, "]");
            if (isHorizontal){
                applyJoinAreaHorizontal();
            } else {
                applyJoinAreaVertical();
            }
            progressCallback(100, 100);
            console.writeln();
        }

        // ===========================================================================
        // Target Overlay from end of join rectangle to end of overlap boundary
        // ===========================================================================
        /**
         * @param {Boolean} isHorizontal
         * @param {Rect} line Rectangle represents row or column, 1 pixel thick
         * @param {Number} x0
         * @param {Number} y0
         * @param {Image|undefined} maskImage
         */
        function applyTgtOverlayLine(isHorizontal, line, x0, y0, maskImage){
            let lineLength = line.area;
            // ref overlay from overlap boundary to join
            refImage.getSamples(refSamples, line, channel);
            tgtImage.getSamples(tgtSamples, line, channel);
            let surfaceSplinePoints = new SurfaceSplinePoints();
            for (let idx=0; idx < lineLength; idx++){
                if (tgtSamples[idx]){
                    outSamples[idx] = tgtSamples[idx] * scale;
                    if (isHorizontal){
                        surfaceSplinePoints.addPoint(idx, x0, y0 + idx); // offset removed later
                    } else {
                        surfaceSplinePoints.addPoint(idx, x0 + idx, y0); // offset removed later
                    }
                } else {
                    outSamples[idx] = refSamples[idx];
                }
            }
            // Remove the surfaceSpline offsets
            if (surfaceSplinePoints.points.length > 0){
                surfaceSplinePoints.evaluate(joinSurfaceSpline);
                surfaceSplinePoints.apply(outSamples);
                if (maskImage){
                    let c = maskImage.isColor ? channel : 0;
                    maskImage.getSamples(maskSamples, line, c);
                    for (let i=0; i<lineLength; i++){
                        if (maskSamples[i] < 1){
                            let mask = maskSamples[i];
                            outSamples[i] = outSamples[i] * mask + refSamples[i] * (1 - mask); 
                        }
                    }
                }
                outputImage.setSamples( outSamples, line, channel );
                surfaceSplinePoints.clear();
            }
        }
        function applyTgtOverlayHorizontal(){
            for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                // Apply to a column (width = 1 pixel)
                let y0 = m_tgtOverlayStartPath[xIdx].y;
                let y1 = m_tgtOverlayEndPath[xIdx].y;
                if (y1 > y0){
                    let x0 = m_tgtOverlayStartPath[xIdx].x;
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    applyTgtOverlayLine(isHorizontal, column, x0, y0);
                }
            }
            // TODO (ONLY if not taper from join):
            // first and second side (only if taper not from join).
            // Ref exists already and does not need to be modified.
            // Target needs adding and correcting to nearest correction.
        }
        function applyTgtOverlayVertical(){
            for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                // Apply to a row (height = 1 pixel)
                let x0 = m_tgtOverlayStartPath[yIdx].x;
                let x1 = m_tgtOverlayEndPath[yIdx].x;
                if (x1 > x0){
                    let y0 = m_tgtOverlayStartPath[yIdx].y;
                    let row = new Rect(x0, y0, x1, y0 + 1);
                    applyTgtOverlayLine(isHorizontal, row, x0, y0);
                }
            }
            // TODO (ONLY if not taper from join):
            // first and second side (only if taper not from join).
            // Ref exists already and does not need to be modified.
            // Target needs adding and correcting to nearest correction.
        }
        
        if (isHorizontal){
            applyTgtOverlayHorizontal();
        } else {
            applyTgtOverlayVertical();
        }

        // ===========================================================================
        // Target: Correct rest of target with target surface spline or average offset
        // ===========================================================================
        let joinPosition = joinRegion.getJoin();
        let overlapSplineArray = createSplineArray(joinSurfaceSpline, overlap, joinPosition, isHorizontal);
        let targetSplineArray;
        if (propagateSurfaceSpline){
            targetSplineArray = createSplineArray(propagateSurfaceSpline, overlap, joinPosition, isHorizontal);
        } else {
            // Create an array where each value is the average of the joinSurfaceSpline difference
            targetSplineArray = createSplineArray(joinSurfaceSpline, overlap, joinPosition, isHorizontal);
            let average = 0;
            for (let i=0; i<targetSplineArray.length; i++){
                average += targetSplineArray[i];
            }
            average /= targetSplineArray.length;
            for (let i=0; i<targetSplineArray.length; i++){
                targetSplineArray[i] = average;
            }
        }
        
        function applyToTargetAfterTaper(line, overlapModelCorrection, targetModelCorrection, useRef){
            // Beyond the taper.
            refImage.getSamples(refSamples, line, channel);
            tgtImage.getSamples(tgtSamples, line, channel);
            let lineLength = line.area;
            for (let idx=0; idx < lineLength; idx++){
                if (tgtSamples[idx]){
                    outSamples[idx] = tgtSamples[idx] * scale - targetModelCorrection;
                } else if (useRef && refSamples[idx]){
                    outSamples[idx] = refSamples[idx] - (targetModelCorrection - overlapModelCorrection);
                } else {
                    outSamples[idx] = 0;
                }
            }
            outputImage.setSamples( outSamples, line, channel );
        }
        function applyToTargetAfterTaperHorizonal(){
            progressCallback(-1, m_overlapBox.width - 1);
            for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                // Apply to a column (width = 1 pixel)
                let y0 = isTargetAfterRef ? m_taperEndPath[xIdx].y : overlap.tgtBox.y0;
                let y1 = isTargetAfterRef ? overlap.tgtBox.y1 : m_taperEndPath[xIdx].y;
                if (y1 > y0){
                    let x0 = m_overlapBox.x0 + xIdx;
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    let targetModelCorrection = targetSplineArray[xIdx];
                    let overlapModelCorrection = overlapSplineArray[xIdx];
                    applyToTargetAfterTaper(column, overlapModelCorrection, targetModelCorrection, true);
                    progressCallback(xIdx, m_overlapBox.width - 1);
                }
            }
            // First side
            let y0 = isTargetAfterRef ? m_taperEndPath[0].y : overlap.tgtBox.y0;
            let y1 = isTargetAfterRef ? overlap.tgtBox.y1 : m_taperEndPath[0].y;
            let targetModelCorrection = targetSplineArray[0];
            let overlapModelCorrection = overlapSplineArray[0];
            for (let x0 = overlap.tgtBox.x0; x0 < m_overlapBox.x0; x0++){
                if (y1 > y0){
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    applyToTargetAfterTaper(column, overlapModelCorrection, targetModelCorrection, false);
                }
            }
            // Second side
            let idx = m_taperEndPath.length - 1;
            y0 = isTargetAfterRef ? m_taperEndPath[idx].y : overlap.tgtBox.y0;
            y1 = isTargetAfterRef ? overlap.tgtBox.y1 : m_taperEndPath[idx].y;
            targetModelCorrection = targetSplineArray[idx];
            overlapModelCorrection = overlapSplineArray[idx];
            for (let x0 = m_overlapBox.x1; x0 < overlap.tgtBox.x1; x0++){
                if (y1 > y0){
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    applyToTargetAfterTaper(column, overlapModelCorrection, targetModelCorrection, false);
                }
            }
        }
        function applyToTargetAfterTaperVertical(){
            progressCallback(-1, m_overlapBox.height - 1);
            for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                // Apply to a row (height = 1 pixel)
                let x0 = isTargetAfterRef ? m_taperEndPath[yIdx].x : overlap.tgtBox.x0;
                let x1 = isTargetAfterRef ? overlap.tgtBox.x1 : m_taperEndPath[yIdx].x;
                if (x1 > x0){
                    let y0 = m_overlapBox.y0 + yIdx;
                    let row = new Rect(x0, y0, x1, y0 + 1);
                    let targetModelCorrection = targetSplineArray[yIdx];
                    let overlapModelCorrection = overlapSplineArray[yIdx];
                    applyToTargetAfterTaper(row, overlapModelCorrection, targetModelCorrection, true);
                    progressCallback(yIdx, m_overlapBox.height - 1);
                }
            }
            // First side
            let xs0 = isTargetAfterRef ? m_taperEndPath[0].x : overlap.tgtBox.x0;
            let xs1 = isTargetAfterRef ? overlap.tgtBox.x1 : m_taperEndPath[0].x;
            let targetModelCorrection = targetSplineArray[0];
            let overlapModelCorrection = overlapSplineArray[0];
            for (let y0 = overlap.tgtBox.y0; y0 < m_overlapBox.y0; y0++){
                if (xs1 > xs0){
                    let column = new Rect(xs0, y0, xs1, y0 + 1);
                    applyToTargetAfterTaper(column, overlapModelCorrection, targetModelCorrection, false);
                }
            }
            // Second side
            let idx = m_taperEndPath.length - 1;
            let xe0 = isTargetAfterRef ? m_taperEndPath[idx].x : overlap.tgtBox.x0;
            let xe1 = isTargetAfterRef ? overlap.tgtBox.x1 : m_taperEndPath[idx].x;
            targetModelCorrection = targetSplineArray[idx];
            overlapModelCorrection = overlapSplineArray[idx];
            for (let y0 = m_overlapBox.y1; y0 < overlap.tgtBox.y1; y0++){
                if (xe1 > xe0){
                    let column = new Rect(xe0, y0, xe1, y0 + 1);
                    applyToTargetAfterTaper(column, overlapModelCorrection, targetModelCorrection, false);
                }
            }
        }

        console.write("Target     [", channel, "]");
        if (isHorizontal){
            applyToTargetAfterTaperHorizonal();
        } else {
            applyToTargetAfterTaperVertical();
        }
        progressCallback(100, 100);
        console.writeln();
  
        // ===========================================================================
        // Target: Taper between overlap model and target model corrections
        // ===========================================================================
        function getTaperFraction(idx, lastIdx, isTargetAfterRef){
            if (isTargetAfterRef){
                return idx / lastIdx;
            }
            return 1 - idx / lastIdx;
        }
        
        /**
         * 
         * @param {Rect} line Rectangle represents row or column, 1 pixel thick
         * @param {Number} overlapModelCorrection
         * @param {Number} targetModelCorrection
         */
        function applyTaper(line, overlapModelCorrection, targetModelCorrection){
            refImage.getSamples(refSamples, line, channel);
            tgtImage.getSamples(tgtSamples, line, channel);
            let lineLength = line.area;
            let allDone = lineLength > 1 ? lineLength - 1 : 1;
            for (let idx=0; idx < lineLength; idx++){
                if (tgtSamples[idx] || refSamples[idx]){
                    if (tgtSamples[idx]){
                        outSamples[idx] = tgtSamples[idx] * scale - overlapModelCorrection;
                    } else {
                        outSamples[idx] = refSamples[idx];
                    }
                    // We now have either the ref sample, or a tgt sample that has been corrected to ref.
                    // In both cases we need to taper it to the targetModel surface spline correction.
                    let fraction = getTaperFraction(idx, allDone, isTargetAfterRef);
                    outSamples[idx] += fraction * (overlapModelCorrection - targetModelCorrection);
                } else {
                    outSamples[idx] = 0;
                }
            }
            outputImage.setSamples( outSamples, line, channel );
        }
        function applyTaperHorizontal(){
            progressCallback(-1, m_overlapBox.width - 1);
            for (let xIdx=0; xIdx < m_overlapBox.width; xIdx++){
                // Apply to a column (width = 1 pixel)
                let y0, y1;
                if (isTargetAfterRef){ // taper down from overlapModel to targetModel
                    y0 = m_taperPath[xIdx].y;
                    y1 = m_taperEndPath[xIdx].y;
                } else { // taper up from targetModel to overlapModel
                    y0 = m_taperEndPath[xIdx].y;
                    y1 = m_taperPath[xIdx].y;
                }
                if (y1 > y0){
                    let x0 = m_taperPath[xIdx].x;
                    let column = new Rect(x0, y0, x0 + 1, y1);
                    // tgt overlay from overlap boundary to join
                    let targetModelCorrection = targetSplineArray[xIdx];
                    let overlapModelCorrection = overlapSplineArray[xIdx];
                    applyTaper(column, overlapModelCorrection, targetModelCorrection);
                    progressCallback(xIdx, m_overlapBox.width - 1);
                }
            }
            // TODO target pixels at sides of taper region
        }
        function applyTaperVertical(){
            progressCallback(-1, m_overlapBox.height - 1);
            for (let yIdx=0; yIdx < m_overlapBox.height; yIdx++){
                // Apply to a row (height = 1 pixel)
                let x0, x1;
                if (isTargetAfterRef){ // taper down from overlapModel to targetModel
                    x0 = m_taperPath[yIdx].x;
                    x1 = m_taperEndPath[yIdx].x;
                } else { // taper up from targetModel to overlapModel
                    x0 = m_taperEndPath[yIdx].x;
                    x1 = m_taperPath[yIdx].x;
                }
                if (x1 > x0){
                    let y0 = m_taperPath[yIdx].y;
                    let row = new Rect(x0, y0, x1, y0 + 1);
                    // tgt overlay from overlap boundary to join
                    let targetModelCorrection = targetSplineArray[yIdx];
                    let overlapModelCorrection = overlapSplineArray[yIdx];
                    applyTaper(row, overlapModelCorrection, targetModelCorrection);
                    progressCallback(yIdx, m_overlapBox.height - 1);
                }
            }
            // TODO target pixels at sides of taper region
        }

        console.write("Taper      [", channel, "]");
        if (isHorizontal){
            applyTaperHorizontal();
        } else {
            applyTaperVertical();
        }
        progressCallback(100, 100);
        console.writeln();
    };

}
