/* global UndoFlag.NoSwapFile */

//"use strict";

/**
 * 
 * @param {Number} targetMedian
 * @param {Number} referenceMedian
 * @param {Rect} rect Bounding box of sample
 * @returns {SamplePair}
 */
function SamplePair(targetMedian, referenceMedian, rect) {
    this.targetMedian = targetMedian;
    this.referenceMedian = referenceMedian;
    this.rect = rect;
    this.weight = 1;
    /**
     * @returns {Number} targetMedian - referenceMedian
     */
    this.getDifference = function(){
        return this.targetMedian - this.referenceMedian;
    };
}

/**
 * @param {SamplePair[]} samplePairs
 * @param {Number} scale
 * @returns {SamplePair[]} Cloned samplePairs array with scaled target median
 */
function applyScaleToSamplePairs(samplePairs, scale){
    let correctedSamplePairs = [];
    for (let samplePair of samplePairs){
        let tgtMedian = samplePair.targetMedian * scale;
        let refMedian = samplePair.referenceMedian;
        let rect = samplePair.rect; // Shallow copy. Don't modify this...
        correctedSamplePairs.push(new SamplePair(tgtMedian, refMedian, rect));
    }
    return correctedSamplePairs;
}

/**
 * 
 * @param {Rect} binArea
 * @param {Number[]} targetMedians median for each channel
 * @param {Number[]} referenceMedians median for each channel
 */
function BinRect(binArea, targetMedians, referenceMedians){
    this.rect = binArea;
    this.tgtMedian = targetMedians;
    this.refMedian = referenceMedians; 
}

// ============ Algorithms ============

/**
 * Used to create the SamplePair array. Immutable class.
 * SamplePair[] are used to model the background level and gradient
 * Samples are discarded if they include black pixels or stars
 * @param {Image} tgtImage
 * @param {Image} refImage
 * @param {Rect} overlapBox overlap bounding box
 * @param {Number} sampleSize Bin size (SamplePair size)
 * @returns {SampleGrid} 
 */
function SampleGrid(tgtImage, refImage, overlapBox, sampleSize){
    // Private class variables

    //Sample size
    const binSize_ = sampleSize;
    // Coordinate of top left bin
    let x0_ = overlapBox.x0;
    let y0_ = overlapBox.y0;
    // Coordinate of the first bin that is beyond the selected area
    let x1_ = overlapBox.x1;
    let y1_ = overlapBox.y1;
    // binRect maps for all colors
    let binRect2dArray_ = null;
    let binCount_;
    
    const nChannels_ = refImage.isColor ? 3 : 1;
    
    addSampleBins(tgtImage, refImage);
    
    /**
     * Add all bins within the overlap area.
     * Reject bins with one or more zero pixels.
     * @param {Image} targetImage
     * @param {Image} referenceImage
     * @returns {undefined}
     */
    function addSampleBins(targetImage, referenceImage){
        let binCount = 0;
        let nColumns = getNumberOfColumns();
        let nRows = getNumberOfRows();
        binRect2dArray_ = new Array(nColumns);
        for (let xKey = 0; xKey < nColumns; xKey++){
            binRect2dArray_[xKey] = [];
            for (let yKey = 0; yKey < nRows; yKey++){
                let added = addBinRect(targetImage, referenceImage, xKey, yKey);
                if (added){
                    binCount++;
                }
            }
        }
        binCount_ = binCount;
    };
    
    /**
     * @returns {Number} The number of bins added to the sample grid. Ignores rejection circles.
     */
    this.getBinCount = function(){
        return binCount_;
    };
    
    /**
     * Creates SamplePair array from the sample grid.
     * The SamplePair array is 'raw'; no scale factor has been applied to the target sample.
     * @param {Star[]} stars
     * @param {PhotometricMosaicData} data
     * @param {Boolean} isOverlapSampleGrid
     * @returns {SamplePair[][]} Returns SamplePair[] for each color. 
     */
    this.createRawSamplePairs = function(stars, data, isOverlapSampleGrid){
        let binRect2dClone = getValidBinRect2d(stars, data, isOverlapSampleGrid);
        let colorSamplePairs = [];
        for (let channel=0; channel<nChannels_; channel++){
            let samplePairArray = [];
            const nColumns = binRect2dClone.length;
            for (let x=0; x<nColumns; x++){
                const nRows = binRect2dClone[x].length;
                for (let y=0; y<nRows; y++){
                    if (binRect2dClone[x][y] !== undefined){
                        let binRect = binRect2dClone[x][y];
                        let tgtMedian = binRect.tgtMedian[channel];
                        let refMedian = binRect.refMedian[channel];
                        let rect = binRect.rect;
                        samplePairArray.push(new SamplePair(tgtMedian, refMedian, rect));
                    }
                }
            }
            colorSamplePairs.push(samplePairArray);
        }
        return colorSamplePairs;
    };
    
    /**
     * @param {Star[]} stars Must be sorted by flux before calling this function
     * @param {PhotometricMosaicData} data
     * @param {Boolean} isOverlapSampleGrid
     * @returns {Rect[]} Array of sample grid rectangles 
     */
    this.getBinRectArray = function(stars, data, isOverlapSampleGrid){
        let binRect2dClone = getValidBinRect2d(stars, data, isOverlapSampleGrid);
        let nColumns = binRect2dClone.length;
        let rects = [];
        for (let x=0; x<nColumns; x++){
            let column = binRect2dClone[x];
            let nRows = column.length;
            for (let y=0; y<nRows; y++){
                if (column[y] !== undefined){
                    rects.push(column[y].rect);
                }
            }
        }
        return rects;
    };
    
    // Private methods
    
    /**
     * @param {Star[]} stars Must be sorted by flux before calling this function
     * @param {PhotometricMosaicData} data
     * @param {Boolean} isOverlapSampleGrid
     * @returns {BinRect[][]} Clone of binRect2dArray_ after sample rejection
     */
    function getValidBinRect2d(stars, data, isOverlapSampleGrid){
        let binRect2dClone = [];
        
        // clone binRect2dArray_[][]
        let nColumns = binRect2dArray_.length;
        for (let x = 0; x < nColumns; x++){
            binRect2dClone[x] = binRect2dArray_[x].slice();
        }
        
        // Remove binRects within star rejection circles
        removeBinRectWithStars(binRect2dClone, stars, data, isOverlapSampleGrid);
        
        // Remove binRects within manual rejection circles
        manualRejectionCircles(binRect2dClone, data, isOverlapSampleGrid);
        
        return binRect2dClone;
    }
    
    /**
     * Remove all bin entries that are fully or partially covered by a star
     * @param {BinRect[][]} binRect2dClone 
     * @param {Star[]} stars Must be sorted by flux before calling this function
     * @param {PhotometricMosaicData} data 
     * @param {Boolean} isOverlapSampleGrid 
     */
    function removeBinRectWithStars(binRect2dClone, stars, data, isOverlapSampleGrid){
        let growthRate = isOverlapSampleGrid ? data.sampleStarGrowthRate : data.sampleStarGrowthRateTarget;
        let firstNstars;
        if (data.limitSampleStarsPercent < 100){
            firstNstars = Math.floor(stars.length * data.limitSampleStarsPercent / 100);
        } else {
            firstNstars = stars.length;
        }
        for (let i=0; i<firstNstars; i++){
            let star = stars[i];
            let starRadius = calcSampleStarRejectionRadius(star, data, growthRate);
            removeBinsInCircle(binRect2dClone, star.pos, starRadius);
        }
    };
    
    /**
     * Remove all bin entries within the manually defined rejection circles
     * @param {BinRect[][]} binRect2dClone
     * @param {PhotometricMosaicData} data 
     * @param {Boolean} isOverlapSampleGrid
     */
    function manualRejectionCircles(binRect2dClone, data, isOverlapSampleGrid){
        for (let circle of data.manualRejectionCircles){
            let p = new Point(circle.x, circle.y);
            let r = isOverlapSampleGrid ? circle.overlapRadius : circle.targetRadius;
            removeBinsInCircle(binRect2dClone, p, r);
        }
    };
    
    /**
     * @param {Number} xKey Nth bin in x direction (starting at zero)
     * @param {Number} yKey Nth bin in y direction (starting at zero)
     * @returns {Point} The (x,y) coordinate of the bin's center
     */
    function getBinCenter(xKey, yKey){
        return new Point(getX(xKey) + binSize_/2, getY(yKey) + binSize_/2);
    }
    /**
     * @returns {Number}
     */
    function getNumberOfColumns(){
        return Math.floor((x1_ - x0_) / binSize_);
    }
    /**
     * 
     * @returns {Number}
     */
    function getNumberOfRows(){
        return Math.floor((y1_ - y0_) / binSize_);
    }
    /**
     * @param {Number} x Any X-Coordinate within a bin, including left edge
     * @returns {Number} Nth sample in x direction (starting at zero)
     */
    function getXKey(x){
        return Math.floor((x - x0_) / binSize_);
    }
    /**
     * @param {Number} y Any Y-Coordinate within a bin, including top edge
     * @returns {Number} Nth sample in y direction (starting at zero)
     */
    function getYKey(y){
        return Math.floor((y - y0_) / binSize_);
    }
    /**
     * @param {Number} xKey Nth bin in x direction (starting at zero)
     * @returns {Number} X-Coordinate of bin's left edge
     */
    function getX(xKey){
        return x0_ + xKey * binSize_;
    }
    /**
     * @param {Number} yKey Nth sample in y direction (starting at zero)
     * @returns {Number} Y-Coordinate of bin's top edge
     */
    function getY(yKey){
        return y0_ + yKey * binSize_;
    }
    
    /**
     * If the specified bin does not contain pixels that are zero (in any channel),
     * add an entry to our binRect map.
     * @param {Image} tgtImage
     * @param {Image} refImage
     * @param {Number} xKey Nth sample in x direction (starting at zero)
     * @param {Number} yKey Nth sample in y direction (starting at zero)
     * @return {Boolean} True if a bin was added
     */
    function addBinRect(tgtImage, refImage, xKey, yKey){
        let rect = new Rect(binSize_, binSize_);
        rect.moveTo(getX(xKey), getY(yKey));
        let refSamples = refImage.bitsPerSample === 64 ? new Float64Array(rect.area) : new Float32Array(rect.area);
        let tgtSamples = tgtImage.bitsPerSample === 64 ? new Float64Array(rect.area) : new Float32Array(rect.area);
        let refMedians = [];
        let tgtMedians = [];
        for (let c=0; c < nChannels_; c++){
            refImage.getSamples(refSamples, rect, c);
            for (let i = 0; i < refSamples.length; i++) {
                if (refSamples[i] === 0){
                    return false;
                }
            }
            tgtImage.getSamples(tgtSamples, rect, c);
            for (let i = 0; i < tgtSamples.length; i++) {
                if (tgtSamples[i] === 0){
                    return false;
                }
            }
            // Neither bin contains a zero for this colour channel.
            // Store median values for this channel
            refMedians[c] = Math.median(refSamples);
            tgtMedians[c] = Math.median(tgtSamples);
        }
        // There are no black pixels in any colour channel, in either the reference or target image
        binRect2dArray_[xKey][yKey] = new BinRect(rect, tgtMedians, refMedians);
        return true;
    }
    
    /**
     * Reject bin entries from the map if:
     * DISTANCE > (starRadius + binSize/2)
     * where DISTANCE = (center of star) to (center of bin)
     * @param {BinRect[][]} binRect2dClone 
     * @param {Point} p
     * @param {Number} starRadius
     */
    function removeBinsInCircle(binRect2dClone, p, starRadius) {
        let starToCenter = starRadius + binSize_/2;
        let starXKey = getXKey(p.x);
        let starYKey = getYKey(p.y);
        let minXKey = Math.max(getXKey(p.x - starRadius), 0);
        let maxXKey = Math.min(getXKey(p.x + starRadius), getNumberOfColumns() - 1);
        let minYKey = Math.max(getYKey(p.y - starRadius), 0);
        let maxYKey = Math.min(getYKey(p.y + starRadius), getNumberOfRows() - 1);
        for (let xKey = minXKey; xKey <= maxXKey; xKey++) {
            let column = binRect2dClone[xKey];
            let nRows = column.length;
            let yKeyLimit = Math.min(maxYKey + 1, nRows);
            for (let yKey = minYKey; yKey < yKeyLimit; yKey++) {
                if (column[yKey] !== undefined){
                    if (xKey === starXKey || yKey === starYKey) {
                        column[yKey] = undefined;
                    } else {
                        let binCenter = getBinCenter(xKey, yKey);
                        if (p.distanceTo(binCenter) < starToCenter) {
                            column[yKey] = undefined;
                        }
                    }
                }
            }
        }
    }

}

/**
 * Get the width of the grid of unrejected samples in terms of sample width.
 * Used for a vertical join (long columns, short rows).
 * @param {Rect} sampleRect
 * @param {SamplePair[]} samplePairArray
 * @returns {Number}
 */
function getSampleGridWidth(sampleRect, samplePairArray){
    if (samplePairArray.length === 0){
        return 0;
    }
    let sampleWidth = samplePairArray[0].rect.width;
    let maxX = samplePairArray[0].rect.x0;
    let minX = maxX;
    let nRows = 0;
    let maximumPossible = Math.floor(sampleRect.width / sampleWidth);
    for (let samplePair of samplePairArray){
        maxX = Math.max(maxX, samplePair.rect.x0);
        minX = Math.min(minX, samplePair.rect.x0);
        nRows = Math.floor((maxX - minX) / sampleWidth) + 1;
        if (nRows >= maximumPossible){
            break;
        }
    }
    return nRows;
}

/**
 * Get the height of the grid of unrejected samples in terms of columns.
 * Used for a horizontal join (short columns, long rows).
 * @param {Rect} sampleRect
 * @param {SamplePair[]} samplePairArray
 * @returns {Number}
 */
function getSampleGridHeight(sampleRect, samplePairArray){
    if (samplePairArray.length === 0){
        return 0;
    }
    let sampleHeight = samplePairArray[0].rect.height;
    let maxY = samplePairArray[0].rect.y0;
    let minY = maxY;
    let nCols = 0;
    let maximumPossible = Math.floor(sampleRect.height / sampleHeight);
    for (let samplePair of samplePairArray){
        maxY = Math.max(maxY, samplePair.rect.y0);
        minY = Math.min(minY, samplePair.rect.y0);
        nCols = Math.floor((maxY - minY) / sampleHeight) + 1;
        if (nCols >= maximumPossible){
            break;
        }
    }
    return nCols;
}

/**
 * For performance, if there are more than sampleMaxLimit samples, the samples are binned
 * into super samples. The binning in x and y directions may differ to ensure that
 * the 'thickness' of the join is not reduced to less than 5 samples by the binning.
 * @param {Rect} overlapBox
 * @param {SamplePair[]} samplePairs
 * @param {Boolean} isHorizontal
 * @param {Number} sampleMaxLimit
 * @returns {SamplePair[]}
 */
function createBinnedSampleGrid(overlapBox, samplePairs, isHorizontal, sampleMaxLimit){ 
    // Private functions

    /**
     * Determine x and y binning factor that will reduce the number of samples to
     * less than maxLength, assuming no samples were rejected (e.g. due to stars).
     * The shape of the binning (e.g. 2x2 or 4x1) is determined by how thick the join is.
     * @param {Rect} sampleRect
     * @param {SamplePair[]} samplePairArray
     * @param {Number} maxLength Maximum number of samples after binning
     * @param {Number} minRowsOrColumns Minimum thickness of sample grid after binning
     * @param {Boolean} isHorizontal
     * @returns {Point} Stores the x and y binning factors
     */
    function calcBinningFactor(sampleRect, samplePairArray, maxLength, minRowsOrColumns, isHorizontal){
        let joinBinning;
        let perpBinning;
        let gridThickness = 0;
        if (isHorizontal){
            gridThickness = getSampleGridHeight(sampleRect, samplePairArray);
        } else {
            gridThickness = getSampleGridWidth(sampleRect, samplePairArray);
        }

        // what reduction factor is required? 2, 4, 9 or 16?
        let factor = samplePairArray.length / maxLength;
        if (factor > 16){
            let bining = Math.ceil(Math.sqrt(factor));
            joinBinning = bining;
            perpBinning = bining;
        } else if (factor > 9){
            // Reduce number of samples by a factor of 16
            if (gridThickness >= minRowsOrColumns * 4){
                // 4x4 binning
                joinBinning = 4;
                perpBinning = 4;
            } else if (gridThickness >= minRowsOrColumns * 3){
                // 5x3 binning
                joinBinning = 5;
                perpBinning = 3;
            } else if (gridThickness >= minRowsOrColumns * 2){
                // 8x2 binning
                joinBinning = 8;
                perpBinning = 2;
            } else {
                // 8x1 binning
                joinBinning = 16;
                perpBinning = 1;
            }
        } else if (factor > 4){
            // Reduce number of samples by a factor of 8 or 9
            if (gridThickness >= minRowsOrColumns * 3){
                // 3x3 binning
                joinBinning = 3;
                perpBinning = 3;
            } else if (gridThickness >= minRowsOrColumns * 2){
                // 4x2 binning
                joinBinning = 4;
                perpBinning = 2;
            } else {
                // 8x1 binning
                joinBinning = 8;
                perpBinning = 1;
            }
        } else if (factor > 2){
            // Reduce by factor of 4
            if (gridThickness >= minRowsOrColumns * 2){
                joinBinning = 2;
                perpBinning = 2;
            } else {
                joinBinning = 4;
                perpBinning = 1;
            }
        } else {
            // Reduce by factor of 2
            joinBinning = 2;
            perpBinning = 1;
        }

        if (isHorizontal){
            return new Point(joinBinning, perpBinning);
        }
        return new Point(perpBinning, joinBinning);
    }

    /**
     * Create a single SamplePair from the supplied array of SamplePair.
     * The input SamplePair[] must all be the same shape and size and have weight=1
     * @param {SamplePair[]} insideBin SamplePairs that are inside the bin area
     * @param {Number} sampleWidth Width of a single input SamplePair
     * @param {Number} sampleHeight Height of a single input SamplePair
     * @param {Number} binWidth Width of fully populated bin in pixels
     * @param {Number} binHeight height of fully populated bin in pixels
     * @returns {SamplePair} Binned SamplePair with center based on center of mass
     */
    function createBinnedSamplePair(insideBin, sampleWidth, sampleHeight, binWidth, binHeight){
        // Weight is the number of input SamplePair that are in the binned area.
        // Not always the geometrically expected number due to SamplePair rejection (e.g. stars)
        const weight = insideBin.length;

        // binnedSamplePair center: calculated from center of mass
        // CoM = (m1.x1 + m2.x2 + m3.x3 + ...) / (m1 + m2 + m3 + ...)
        // But in our case all input samples have weight = 1
        // So CoM = (x1 + x2 + x3 + ...) / nSamples
        let xCm = 0;
        let yCm = 0;
        let targetMedian = 0;
        let referenceMedian = 0;
        for (let sp of insideBin){
            xCm += sp.rect.center.x;
            yCm += sp.rect.center.y;
            targetMedian += sp.targetMedian;
            referenceMedian += sp.referenceMedian;
        }
        let center = new Point(Math.round(xCm/weight), Math.round(yCm/weight));

        // Use the average value for target and reference median
        targetMedian /= weight;
        referenceMedian /= weight;


        // Area is (weight) * (area of a single input SamplePair)
        // Create a square binnedSamplePair based on this area and the calculated center
        let area = weight * sampleWidth * sampleHeight;
        let width;
        let height;
        if (area === binWidth * binHeight){
            // fully populated bin
            width = binWidth;
            height = binHeight;
        } else {
            width = Math.sqrt(area);
            height = width;
        }
        let halfWidth = Math.round(width / 2);
        let halfHeight = Math.round(height / 2);
        let x0 = center.x - halfWidth;
        let x1 = x0 + width;
        let y0 = center.y - halfHeight;
        let y1 = y0 + height;
        let rect = new Rect(x0, y0, x1, y1);
        let binnedSamplePair = new SamplePair(targetMedian, referenceMedian, rect);
        binnedSamplePair.weight = weight;
        return binnedSamplePair;
    }

    /**
     * Create a binned SamplePair array of larger samples to reduce the number of
     * samples to less then sampleMaxLimit. It assumes no samples were rejected by stars,
     * so the binned SamplePair array may exceed sampleMaxLimit due to star rejection.
     * @param {Rect} sampleRect
     * @param {SamplePair[]} samplePairArray Must all be the same shape and size and have weight=1
     * @param {Number} sampleMaxLimit Try to reduce the number of samples to below this number 
     * @param {Number} minRows Limit binning perpendicular to join if the final join thickness is less than this.
     * @param {Boolean} isHorizontal
     * @returns {SamplePair[]} Binned SamplePair with center based on center of mass
     */
    function createBinnedSamplePairArray(sampleRect, samplePairArray, sampleMaxLimit, minRows, isHorizontal){
        let factor = calcBinningFactor(sampleRect, samplePairArray, sampleMaxLimit, minRows, isHorizontal);

        // width and height of single input sample
        let sampleWidth = samplePairArray[0].rect.width;
        let sampleHeight = samplePairArray[0].rect.height;

        let binWidth = sampleWidth * factor.x;
        let binHeight = sampleHeight * factor.y;

        // Create an empty 3 dimensional array
        // The x,y dimensions specify the new binned sample positions
        // Each (x,y) location stores all the input samples within this binned area
        let xLen = Math.floor(sampleRect.width / binWidth) + 1;
        let yLen = Math.floor(sampleRect.height / binHeight) + 1;
        let binnedSampleArrayXY = new Array(xLen);
        for (let x=0; x<xLen; x++){
            binnedSampleArrayXY[x] = new Array(yLen);
            for (let y=0; y<yLen; y++){
                binnedSampleArrayXY[x][y] = [];
            }
        }

        // Populate the (x,y) locations with the input samples that fall into each (x,y) bin
        for (let samplePair of samplePairArray){
            let x = Math.floor((samplePair.rect.center.x - sampleRect.x0) / binWidth);
            let y = Math.floor((samplePair.rect.center.y - sampleRect.y0) / binHeight);
            binnedSampleArrayXY[x][y].push(samplePair);
        }

        // For each (x,y) location that stores one or more input samples,
        // create a binned sample and add it to the binnedSampleArray
        let binnedSampleArray = [];
        for (let x=0; x<xLen; x++){
            for (let y=0; y<yLen; y++){
                if (binnedSampleArrayXY[x][y].length > 0){
                    binnedSampleArray.push(createBinnedSamplePair(binnedSampleArrayXY[x][y],
                            sampleWidth, sampleHeight, binWidth, binHeight));
                }
            }
        }
        return binnedSampleArray;
    }
    
    {
        const minRows = 5;
        if (samplePairs.length > sampleMaxLimit){
            let binnedSampleArray = createBinnedSamplePairArray(overlapBox, samplePairs, 
                    sampleMaxLimit, minRows, isHorizontal);
            if (binnedSampleArray.length > sampleMaxLimit){
                // This can happen because many samples in grid were rejected due to stars
                sampleMaxLimit *= sampleMaxLimit / binnedSampleArray.length;
                binnedSampleArray = createBinnedSamplePairArray(overlapBox, samplePairs, 
                    sampleMaxLimit, minRows, isHorizontal);
            }
            return binnedSampleArray;
        }
    }
    return samplePairs;
}
