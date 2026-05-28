/* global ImageWindow, ChannelExtraction, UndoFlag.NoSwapFile, MultiscaleLinearTransform, StdButton.Yes, GraphDialog, APERTURE_GROWTH, APERTURE_ADD, STAR_BKG_DELTA, PenStyle.Dash, PenStyle.Dot, FillRule.OddEven */

//"use strict";
#define __PJSR_NO_STAR_DETECTOR_TEST_ROUTINES 1
#define __PJSR_STAR_OBJECT_DEFINED  1
#include "StarDetector.jsh"


/**
 * Calculates the number of pixels equal to 0.007 degrees (25 arcseconds).
 * @param {PhotometricMosaicData} data
 * @returns {Number} Maximum star size in pixels
 */
function calcDefaultGrowthLimit(data){
    let pixelAngle = calcDegreesPerPixel(data.pixelSize, data.focalLength);
    // 0.005 deg = 18 arcsec
    return 0.007 / pixelAngle;
}

/**
 * Calculates the number of pixels equal to 135 arcseconds.
 * @param {PhotometricMosaicData} data
 * @returns {Number} Maximum star size in pixels
 */
function calcDefaultTargetGrowthLimit(data){
    let pixelAngle = calcDegreesPerPixel(data.pixelSize, data.focalLength);
    // 0.005 deg = 18 arcsec
    return 0.0375 / pixelAngle;
}

/**
 * @param {Number} maxStarFlux Maximum star flux, or undefined
 * @param {Number} defaultGrowth
 * @param {Number} growthLimit
 * @returns {Number} Calculated growth rate
 */
function calcStarGrowthRate(maxStarFlux, defaultGrowth, growthLimit){
    if (maxStarFlux !== undefined){
        if (maxStarFlux * defaultGrowth > growthLimit){
            return growthLimit / maxStarFlux;
        }
    }
    return defaultGrowth;
}

/**
 * Set the outer photometry aperture thickness to 70 microns on the detector
 * @param {PhotometricMosaicData} data
 * @returns {Number} outer aperture thickness in pixels
 */
function calcDefaultApertureBgDelta(data){
    return Math.round(70 / data.pixelSize);
}

/**
 * Set the gap between photometry aperture rings to 1.8 arcsec (0.0005 degrees)
 * @param {PhotometricMosaicData} data
 * @returns {Number} gap between star aperture and background aperture
 */
function calcDefaultApertureGap(data){
    let pixelAngle = calcDegreesPerPixel(data.pixelSize, data.focalLength);
    // 0.0005 deg = 1.8 arcsec
    let gap = Math.round(0.0005 / pixelAngle);
    return Math.max(1, gap);
}

/**
 * @param {Number x, Number y} pos Centroid position in pixels, image coordinates
 * @param {Number} flux Total flux, normalized intensity units
 * @param {Number} size Area of detected star structure in square pixels
 * @param {Number} bkg Local background estimate
 * @param {Number} peak Value at peak
 * @param {Rect} rect Star bounding box
 * @returns {Star}
 */
function Star(pos, flux, size, bkg, peak, rect) {
    // Centroid position in pixels, image coordinates (from StarDetector).
    this.pos = new Point(pos.x, pos.y);
    // Total flux, normalized intensity units (from StarDetector).
    this.flux = flux;
    // Area of detected star structure in square pixels (from StarDetector).
    this.size = size;

    // Value at peak (from StarDetector)
    let _peakValue = peak;
    // Star bounding box (from StarDetector)
    let _boundingBox = new Rect(rect);
    
    let _starRadius = Math.max(rect.width, rect.height) / 2;
    // Calculated star only flux (total flux - background flux)
    let _starFlux = flux - bkg * size;
    
    this.insideOverlap = true;
    
    /**
     * Star was detected within a cropped image. Move it to the full image coordinate.
     * @param {Number} x0
     * @param {Number} y0
     */
    this.moveBy = function(x0, y0){
        this.pos.x += x0;
        this.pos.y += y0;
        _boundingBox.moveBy(x0, y0);
    };
    
    /**
     * @returns {rect} star bounding box (from StarDetector)
     */
    this.getBoundingBox = function () {
        return new Rect(_boundingBox);
    };
    
    /**
     * @returns {Number} star peak value (from StarDetector)
     */
    this.getPeakValue = function () {
        return _peakValue;
    };
    
    /**
     * @returns {Number} Calculated star flux
     */
    this.getStarFlux = function (){
        return _starFlux;
    };
    
    /**
     * @returns {Number} Star radius
     */
    this.getStarRadius = function (){
        return _starRadius;
    };
}

/**
 * Photometric Star
 * @param {Star} star
 * @param {Image} image
 * @param {Number} channel Color channel
 * @param {Rect} aperture The star aperture
 * @param {Number} gap Gap between star aperture and background aperture
 * @param {Number} bgDelta Thickness of background annulus
 * @returns {PmStar}
 */
function PmStar(star, image, channel, aperture, gap, bgDelta) {
    let _starFlux;
    let _fluxOk = false;
    let _star = star;
    let _starAperture = new Rect(aperture);
    let _bgInnerRect = _starAperture.inflatedBy(gap);
    let _bgOuterRect = _bgInnerRect.inflatedBy(bgDelta);
    
    // Limit apertures to image area
    let imageRect = new Rect(image.width, image.height);
    if (_starAperture.intersects( imageRect )){
        // All three rectangles intersect with the image
        let fullArea = _starAperture.area;
        _starAperture.intersect( imageRect );
        _bgInnerRect.intersect( imageRect );
        _bgOuterRect.intersect( imageRect );
        if (fullArea === _starAperture.area){
            // The star aperture is entirely within the image, so calc _starFlux and set _fluxOk
            _starFlux = calcStarFlux(image, channel);
        }
    }
    
    /**
     * Calculate median of all the image samples that are inbetween
     * an inner and outer rectangle.
     * @param {Image} image
     * @param {Number} channel
     * @returns {Number} median
     */
    function calcBackgroundMedian(image, channel){
        let rects = [];
        rects.push(new Rect(_bgOuterRect.x0, _bgOuterRect.y0, _bgOuterRect.x1, _bgInnerRect.y0));  //top
        rects.push(new Rect(_bgOuterRect.x0, _bgInnerRect.y1, _bgOuterRect.x1, _bgOuterRect.y1));  // bottom
        rects.push(new Rect(_bgOuterRect.x0, _bgInnerRect.y0, _bgInnerRect.x0, _bgInnerRect.y1));  // left
        rects.push(new Rect(_bgInnerRect.x1, _bgInnerRect.y0, _bgOuterRect.x1, _bgInnerRect.y1));  // right
        
        /** All image samples inbetween the inner and outer rectangles  */
        let allSamples = [];
        for (let rect of rects){
            let area = rect.area;
            if (area > 0){
                let samples = image.bitsPerSample === 64 ? new Float64Array(area) : new Float32Array(area);
                image.getSamples(samples, rect, channel);
                for (let i=0; i<samples.length; i++){
                    if (samples[i] > 0){ // don't include black pixels
                        allSamples.push(samples[i]);
                    }
                }
            }
        }
        return Math.median(allSamples);
    }

    /**
     * Sets the star aperture and then calculates th star's flux and radius.
     * @param {Image} image 
     * @param {Number} channel Color channel
     */
    function calcStarFlux(image, channel) {
        let aperture = _starAperture;
        // Calculate total star flux (i.e. star + star background)
        let length = aperture.area;
        let samples = image.bitsPerSample === 64 ? new Float64Array(length) : new Float32Array(length);
        let nSamples = 0;
        let flux = 0;
        image.getSamples(samples, aperture, channel);
        for (let i = 0; i < length; i++) {
            if (samples[i] > 0) {
                flux += samples[i];
                nSamples++;
            }
        }
        let bg = calcBackgroundMedian(image, channel);
        let starFlux = flux - bg * nSamples;
        _fluxOk = (nSamples === length && starFlux > 0);  // false if star rect contained black samples
        return starFlux;
    };
    
    this.getStar = function(){
        return _star;
    };
    /**
     * @returns {Number} Calculated star flux
     */
    this.getStarFlux = function (){
        return _starFlux;
    };
    
    /**
     * @returns {Boolean} True if there are no zero pixels within starAperture
     */
    this.isFluxOk = function (){
        return _fluxOk;
    };
    
    /**
     * @returns {Number} Photometry star aperture
     */
    this.getStarAperture = function (){
        return new Rect(_starAperture);
    };
    
    /**
     * @returns {Number} Photometry star background inner aperture
     */
    this.getStarBgAperture1 = function (){
        return new Rect(_bgInnerRect);
    };
    
    /**
     * @returns {Number} Photometry star background outer aperture
     */
    this.getStarBgAperture2 = function (){
        return new Rect(_bgOuterRect);
    };
}

/**
 * @param {Number} apertureAdd
 * @param {Number} growthRate
 * @param {Number} starFlux
 * @returns {Number} Inflate the star's bounding box by this to create aperture.
 * Does not round the result.
 */
function calcApertureCorrection(apertureAdd, growthRate, starFlux){
    return apertureAdd + growthRate * starFlux;
}

/**
 * Creates a pair of stars based on the input refStar and tgtStar, and data values.
 * The input refStar and tgtStar were detected by StarDetector.
 * 
 * The star aperture is calculated by:
 * (1) The union of refStar's and tgtStar's original boundingBox.
 * This is stored as a delta for top, left, bottom, right to keep the rectangle 
 * center at the star's center.
 * (2) An aperture inflation is calculated, using the max flux from refStar and tgtStar.
 * (We use the flux from refStar and tgtStar for consistency - their flux is not 
 * modified after StarDetector returned them.)
 * The calculation also uses data.apertureAdd, data.apertureGrowthRate
 * (3) The new star fluxes for the two new stars are calculated using the new aperture
 * 
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {Image} refImage
 * @param {Image} tgtImage
 * @param {Star} refStar
 * @param {Star} tgtStar
 * @param {Number} channel
 * @returns {StarPair}
 */
function StarPair(data, refImage, tgtImage, refStar, tgtStar, channel){
    
    /**
     * Used to increase the size of the star bounding box
     * @param {Star} refStar
     * @param {Star} tgtStar
     * @returns {StarPair.Delta}
     */
    function Delta (refStar, tgtStar){
        let refRect = refStar.getBoundingBox();
        let tgtRect = tgtStar.getBoundingBox();
        let maxFlux = Math.max(refStar.getStarFlux(), tgtStar.getStarFlux());
        let top = Math.max(refStar.pos.y - refRect.y0, tgtStar.pos.y - tgtRect.y0);
        let left = Math.max(refStar.pos.x - refRect.x0, tgtStar.pos.x - tgtRect.x0);
        let bottom = Math.max(refRect.y1 - refStar.pos.y, tgtRect.y1 - tgtStar.pos.y);
        let right = Math.max(refRect.x1 - refStar.pos.x, tgtRect.x1 - tgtStar.pos.x);
        
        function calcAperture(star, inflate){
            let x0 = Math.round(star.pos.x - (left + inflate));
            let y0 = Math.round(star.pos.y - (top + inflate));
            let x1 = Math.round(star.pos.x + (right + inflate));
            let y1 = Math.round(star.pos.y + (bottom + inflate));
            return new Rect(x0, y0, x1, y1);
        }
        this.getInflate = function (apertureAdd, apertureGrowthRate){
            return Math.round(calcApertureCorrection(apertureAdd, apertureGrowthRate, maxFlux));
        };
        this.getInflatedRefAperture = function (inflate){
            return calcAperture(refStar, inflate);
        };
        this.getInflatedTgtAperture = function (inflate){
            return calcAperture(tgtStar, inflate);
        };
    }
    
    let delta = new Delta(refStar, tgtStar);
    let inflate = delta.getInflate(data.apertureAdd, data.apertureGrowthRate);
    let refAperture = delta.getInflatedRefAperture(inflate);
    this.refPmStar = new PmStar(refStar, refImage, channel, refAperture, data.apertureGap, data.apertureBgDelta);
    let tgtAperture = delta.getInflatedTgtAperture(inflate);
    this.tgtPmStar = new PmStar(tgtStar, tgtImage, channel, tgtAperture, data.apertureGap, data.apertureBgDelta);

}

/**
 * Used to store a star in a BRQuadTree (BRQuadTree needs the object to have this.rect)
 * @param {Star} star
 * @param {Number} radius Set this to data.starSearchRadius / 2.0
 * @returns {StarEntry}
 */
function StarEntry(star, radius){
    this.star = star;
    this.rect = new Rect(
            star.pos.x - radius, star.pos.y - radius,
            star.pos.x + radius, star.pos.y + radius);
}

/**
 * Filter out stars with a peak pixel value greater than peakUpperLimit and
 * stars outside the overlap and stars with negative flux.
 * @param {Star[]} stars Stars to be filtered. This array is not modified.
 * @param {Number} peakUpperLimit Linear range
 * @returns {Star[]} The filtered stars
 */
function filterStars(stars, peakUpperLimit){
    let filteredStars = [];
    for (let star of stars) {
        if ((star.getPeakValue() < peakUpperLimit) &&
                star.insideOverlap && star.getStarFlux() > 0) {
            filteredStars.push(star);
        }
    }
    return filteredStars;
};

/**
 * 
 * @param {Star[]} tgtStars
 * @param {Number} starSearchRadius
 * @param {Number} linearRangeTgt 
 * @param {Rect} overlapBox
 * @returns {BRQuadTree}
 */
function createQuadTree(tgtStars, starSearchRadius, linearRangeTgt, overlapBox){
    let stars = filterStars(tgtStars, linearRangeTgt);
    let radius = starSearchRadius / 2.0;
    let objects = [];
    for (let star of stars){
        objects.push(new StarEntry(star, radius));
    }
    let quadTree = new BRQuadTree();
    quadTree.build(objects, 16, overlapBox);
    return quadTree;
}

/**
 * @param {BRQuadTree} quadTree target stars and their search rectangles
 * @param {Star[]} refStars
 * @param {Number} searchRadius Set this to data.starSearchRadius
 * @param {Number} fluxTolerance
 * @param {Number} linearRangeRef
 * @returns {StarMatch[]}
 */
function calcStarMatchArray(quadTree, refStars, searchRadius, fluxTolerance, linearRangeRef){
    // Use our first pass to calculate the approximate gradient. This pass might contain
    // stars that matched with noise or very faint stars
    let rStars = filterStars(refStars, linearRangeRef);
    if (!rStars.length || !quadTree.objects.length){
        return [];
    }
    rStars.sort(sortOnFlux);
    
    /**
     * @param {StarMatch[]} estimateArray
     * @returns {Number} gradient
     */
    function calcEstimatedGradient(estimateArray){
        // For a small number of stars that are only at the high end,
        // a forced fit through the origin is more robust.
        let leastSquareFit = new LeastSquareFitAlgorithm();
        for (let starMatch of estimateArray) {
            leastSquareFit.addValue(starMatch.tgtStar.getStarFlux(), starMatch.refStar.getStarFlux());
        }
        return leastSquareFit.getOriginFit().m;
    }
    
    // Get a very rough estimate of gradient from the 50 brightest photometry stars
    // Large tolerance allows matching images from 16 bit and 12 bit sensors, with up to 2x scale dif
    let estimateArray = matchStars(quadTree, rStars, searchRadius, 1, 32, 50);
    if (!estimateArray.length)
        return [];
    let estimatedGradient = calcEstimatedGradient(estimateArray);
    
    // Refine the estimate by reducing tolerance
    estimateArray = matchStars(quadTree, rStars, searchRadius, estimatedGradient, 4, 50);
    if (!estimateArray.length)
        return [];
    estimatedGradient = calcEstimatedGradient(estimateArray);
    
    // Create the StarMatch array with the refined gradient estimate
    let starMatchArray = matchStars(quadTree, rStars, searchRadius, estimatedGradient, fluxTolerance, 2000);
    return starMatchArray;
}

/**
 * Sort on flux, brightest stars at the end of the array
 * @param {Star} a
 * @param {Star} b
 * @returns {Number}
 */
function sortOnFlux(a, b) {
    return a.getStarFlux() - b.getStarFlux();
};

/**
 * @param {Star} refStar
 * @param {Star} tgtStar
 * @returns {StarMatch}
 */
function StarMatch(refStar, tgtStar){
    this.refStar = refStar;
    this.tgtStar = tgtStar;
    /**
     * @param {PhotometricMosaicData} data Values from user interface
     * @param {Image} refImage
     * @param {Image} tgtImage
     * @param {Number} channel
     * @returns {StarPair}
     */
    this.calcStarPair = function(data, refImage, tgtImage, channel){
        return new StarPair(data, refImage, tgtImage, this.refStar, this.tgtStar, channel);
    };
}

/**
 * Use flux and search radius to match stars.
 * Start with the brightest ref star and look for a tgt star
 * within the searchRadius that has the expected brightness.
 * @param {BRQuadTree} quadTree Contains the tgtStars
 * @param {Star[]} refStars Must be sorted in ascending order (last item is brightest)
 * @param {Number} starSearchRadius Set this to Data.starSearchRadius
 * @param {Number} gradient Expected gradient (ref flux / target flux) 
 * @param {Number} tolerance
 * @param {Number} maxPairs Maximum number of matched stars to return
 * @returns {StarMatch[]} Array of matched stars
 */
function matchStars(quadTree, refStars, starSearchRadius, gradient, tolerance, maxPairs){

    function isFluxTooHigh(rStar, tStar, maxGradient){
        let gradient = rStar.getStarFlux() / tStar.getStarFlux();
        return gradient > maxGradient;
    }
    function isFluxTooLow(rStar, tStar, minGradient){
        let gradient = rStar.getStarFlux() / tStar.getStarFlux();
        return gradient < minGradient;
    }

    let minGradient = gradient / tolerance;
    let maxGradient = gradient * tolerance;
    let halfSearchRadius = starSearchRadius / 2;
    let starMatchArray = [];
    let r = refStars.length;
    while (r-- && starMatchArray.length < maxPairs) {
        let rStar = refStars[r];
        let searchRect = (new StarEntry(rStar, halfSearchRadius)).rect;
        let index = quadTree.search(searchRect);
        if (!index.length){
            continue;   // No match found
        }
        let tgtStars = [];  // Add all tgt stars within the rStar search window
        for (let i of index){
            tgtStars.push(quadTree.objects[i].star);
        }
        // Find the tgt star closest to the expected flux
        tgtStars.sort(sortOnFlux);
        let tgtIdx = starFluxSearch(tgtStars, rStar.getStarFlux() / gradient);
        if (tgtIdx !== -1){
            let tStar = tgtStars[tgtIdx];
            if (!isFluxTooHigh(rStar, tStar, maxGradient) &&
                    !isFluxTooLow(rStar, tStar, minGradient)){
                starMatchArray.push(new StarMatch(rStar, tStar));
            }
        }
    }
    return starMatchArray;
}

/**
 * Return the index of the entry closest to flux
 * @param {Star[]} starSortedArray Must be sorted, ascending order (highest flux at end)
 * @param {Number} flux
 * @returns {Number} index Returns -1 if starSortedArray is empty
 */
function starFluxSearch(starSortedArray, flux) {
    if (!starSortedArray.length){
        return -1;
    }
    let low = 0;
    let high = starSortedArray.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        // if guess > 0, entry[mid] is larger than flux
        // if guess < 0, entry[mid] is smaller than flux
        const guess = starSortedArray[mid].getStarFlux() - flux;
        if (guess === 0) {
            return mid;
        } else if (guess > 0) {
            if (mid === 0){
                return mid; // First array item is larger than flux
            }
            let previous = starSortedArray[mid-1].getStarFlux() - flux;
            if (previous < 0){
                // [mid] entry is larger then flux, and [mid-1] is smaller than flux
                return Math.abs(previous) < Math.abs(guess) ? mid-1 : mid;
            }
        } 
        else if (guess < 0){
            if (mid === starSortedArray.length - 1){
                return mid; // last array item is smaller than flux
            }
            let next = starSortedArray[mid+1].getStarFlux() - flux;
            if (next > 0){
                // [mid] entry is smaller then flux, and [mid+1] is larger than flux
                return Math.abs(next) < Math.abs(guess) ? mid+1 : mid;
            }
        }
        if (guess > 0) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    // This should not happen - there should always be a closest entry.
    console.criticalln("Logic error in starFluxSearch!");
    return -1; // Not found
}

/**
 * 
 * @param {Number} nChannels
 * @param {PhotometricMosaicData} data Values from user interface
 * @returns {StarPair[][]} Array of StarPair[] for each color channels
 */
function getColorStarPairs(nChannels, data){
    /**
     * Finds the stars that exist in both images that have no pixel above upperLimit.
     * @param {Number} channel
     * @param {PhotometricMosaicData} data Values from user interface
     * @returns {StarPair[]} Matching star pairs. All star pixels are below the upperLimit.
     */
    function createStarPairs(channel, data) {
        let starMatchArray = data.cache.getStarMatchArray(
                data.starSearchRadius, data.starFluxTolerance, data.linearRangeRef, data.linearRangeTgt);
        
        let refImage = data.referenceView.image;
        let tgtImage = data.targetView.image;
        let maxPairs = Math.round(starMatchArray.length * data.limitPhotoStarsPercent / 100);
        if (!maxPairs){
            return [];
        }
        let starPairGradientArray = [];
        for (let i=0; i<maxPairs; i++){
            let starPair = starMatchArray[i].calcStarPair(data, refImage, tgtImage, channel);
            if (starPair.refPmStar.isFluxOk() && starPair.tgtPmStar.isFluxOk()){
                starPairGradientArray.push(starPair);
            }
        }
        let linearFit = calculateScale(starPairGradientArray);
        let tolerance = data.starFluxTolerance;
        let minGradient = linearFit.m / tolerance;
        let maxGradient = linearFit.m * tolerance;
        let starPairArray = [];
        for (let starPair of starPairGradientArray){
            let gradient = starPair.refPmStar.getStarFlux() / starPair.tgtPmStar.getStarFlux();
            if (gradient >= minGradient && gradient <= maxGradient){
                starPairArray.push(starPair);
            }
        }
        return starPairArray;
    }
    
    let colorStarPairs = [];
    for (let channel=0; channel < nChannels; channel++){
        let starPairs = createStarPairs(channel, data);
        let removeN = Math.round(starPairs.length * data.outlierRemovalPercent / 100);
        // Remove outliers
        for (let i=0; i<removeN; i++){
            if (starPairs.length < 4){
                    console.warningln("Channel[" + channel + "]: Only " + starPairs.length +
                    " photometry stars. Keeping outlier.");
                break;
            }
            let linearFitData = calculateScale(starPairs);
            starPairs = removeStarPairOutlier(starPairs, linearFitData);
        }
        colorStarPairs.push(starPairs);
    }
    return colorStarPairs;
};

/**
 * 
 * @param {View} view Detect stars in this view
 * @param {String} label Displayed within the progress messages (supply Reference or Target)
 * @param {Rect} overlap
 * @param {Number} logSensitivity 
 * @returns {DetectedStars}
 */
function DetectedStars(view, label, overlap, logSensitivity){
    let isColor_ = view.image.isColor;
    let hasUnreliableStars_ = false;
    let logSensitivity_ = logSensitivity;
    let starImage_;
    let rawStars_;
    let overlapStarCount_ = 0;
    let viewArea = overlap.getStarOverlapBox();
    
    function getStarImage(){
        if (!starImage_){     
            let width = viewArea.width;
            let height = viewArea.height;
            // Create an image from the star overlap rectangle
            let fullImg = view.image;
            let image = new Image(width, height, fullImg.numberOfChannels, fullImg.colorSpace);
            let samples = new Float32Array(viewArea.area);
            let rect = new Rect(width, height);
            for (let c = 0; c < fullImg.numberOfChannels; c++){
                view.image.getSamples(samples, viewArea, c);
                image.setSamples(samples, rect, c);
            }
            starImage_ = image;
        }
        return starImage_;
    }
    
    function detectRawStars(){
        let lastProgressPc = 0;
        function progressCallback(count, total){
            if (count === 0){
                console.write("<end><cbr>Detecting stars: ", label, "   0%");
                lastProgressPc = 0;
                CoreApplication.processEvents();
            } else{
                let pc = Math.round(100 * count / total);
                if (pc > lastProgressPc && (pc > lastProgressPc + 5 || pc === 100)){
                    if (pc < 100){
                        console.write(format("\b\b\b\b%3d%%", pc));
                    } else {
                        console.write(format("\b\b\b\b"));
                    }
                    lastProgressPc = pc;
                    CoreApplication.processEvents();
                }
            }
            return true;
        }
        let starDetector = new PMStarDetector();
        starDetector.progressCallback = progressCallback;
        starDetector.mask = overlap.getStarDetectMask();
        starDetector.sensitivity = Math.pow(10.0, logSensitivity_);
        starDetector.upperLimit = 1;
        // Noise reduction affects the accuracy of the photometry
        starDetector.applyHotPixelFilterToDetectionImage = false;
        starDetector.bkgDelta = STAR_BKG_DELTA;
        let detectedStars = starDetector.stars(getStarImage());
        let stars = processRawStars(detectedStars);
        console.writeln("detected ", overlapStarCount_, " stars");
        return stars;
    }
    
    function processRawStars(rawStars){
        let overlapBox = overlap.overlapBox;
        let overlapMask = overlap.getOverlapMask();
        overlapStarCount_ = 0;
        let x0 = viewArea.x0;
        let y0 = viewArea.y0;
        for (let star of rawStars){
            star.moveBy(x0, y0);
            let starX = Math.round(star.pos.x);
            let starY = Math.round(star.pos.y);
            let x = starX - overlapBox.x0;
            let y = starY - overlapBox.y0;
            star.insideOverlap = (
                    x >= 0 && x < overlapMask.width &&
                    y >= 0 && y < overlapMask.height &&
                    overlapMask.sample(x, y) > 0);
            if (star.insideOverlap){
                overlapStarCount_++;
            }
        }
        
        let stars = rawStars;
        // Check for negative flux
        let minusFluxStars = 0;
        for (let star of stars){
            if (star.getStarFlux() <= 0){
                minusFluxStars++;
            }
        }
        if (minusFluxStars){
            let msg = "Excluded " + minusFluxStars + " stars with flux &lt; 0.0, ";
            if ((minusFluxStars > 100) && (minusFluxStars / stars.length > 0.05)){
                console.warning(msg);
                hasUnreliableStars_ = true;
            } else {
                console.write(msg);
            }
            let goodStars = [];
            for (let star of stars){
                if (star.getStarFlux() > 0 ){
                    goodStars.push(star);
                }
            }
            stars = goodStars;
        }
        return stars;
    }
    
    /**
     * Set the log sensitivity value. If it changes, the cached stars are removed.
     * @param {Number} logValue New logSensitivity value
     * @returns {Boolean} True if the value was changed
     */
    this.setLogSensitivity = function(logValue){
        if (logSensitivity_ !== logValue){
            logSensitivity_ = logValue;
            hasUnreliableStars_ = false;
            rawStars_ = undefined;
            overlapStarCount_ = 0;
            return true;
        }
        return false;
    };
    
    this.getStars = function(){
        if (!rawStars_){
            rawStars_ = detectRawStars();
        }
        return rawStars_;
    };
    
    this.getOverlapStarCount = function(channel){
        return overlapStarCount_[channel];
    };
    
    this.hasUnreliableStars = function(){
        return hasUnreliableStars_;
    };
    
    this.isCached = function(){
        if (rawStars_){
            return true;
        }
        return false;
    };
    
    this.isColor = function(){
        return isColor_;
    };
    
    this.clear = function(){
        if (starImage_){
            starImage_.free();
        }
        starImage_ = null;
        rawStars_ = null;
        logSensitivity_ = null;
    };
}

/**
 * Combien star arrays removing duplicate stars (keep star with maximum flux)
 * @param {DetectedStars} detectedRefStars All reference stars
 * @param {DetectedStars} detectedTgtStars All target stars
 * @returns {Star[]} All stars, sorted by brightness (brightest first)
 */
function combienStarArrays(detectedRefStars, detectedTgtStars){
    let radius = 1.0;
    let otherStars = detectedRefStars.getStars().concat(detectedTgtStars.getStars());
    // Sort order: brightest to dimmest (descending order)
    // This ensures the first star to be inserted into the quadTree 
    // within an area will be the brightest star of this area.
    otherStars.sort((a, b) => b.getStarFlux() - a.getStarFlux());

    let quadTree = new BRQuadTree();
    for (let star of otherStars){
        let qtStar = new StarEntry(star, radius);
        let index = quadTree.search(qtStar.rect);
        if (!index.length){
            quadTree.insert(qtStar);
        }
    }

    let allStars = [];
    for (let qtStar of quadTree.objects){
        allStars.push(qtStar.star);
    }
    quadTree.clear();
    quadTree = null;
    otherStars = null;
    // Sort order: brightest to dimmest (descending order)
    allStars.sort((a, b) => b.getStarFlux() - a.getStarFlux());
    return allStars;
}

/**
 * @param {MosaicCache} cache 
 */
function cacheRawStars(cache){
    // Reference and target image stars
    let refDetectRawStars = cache.getDetectedRefStars();
    let tgtDetectRawStars = cache.getDetectedTgtStars();
    if (!refDetectRawStars.isCached() || !tgtDetectRawStars.isCached()){
        let detectStarTime = new Date().getTime();
        console.write("<b><u>Detecting stars</u></b>\n");
        refDetectRawStars.getStars();
        tgtDetectRawStars.getStars();
        if (refDetectRawStars.hasUnreliableStars() || tgtDetectRawStars.hasUnreliableStars()){
            let msg = "<b>Warning: Invalid stars might have been detected.</b>\n" +
                "Display the 'Detected stars' dialog (Star Detection section). Inspect ";
            if (refDetectRawStars.hasUnreliableStars()){
                msg += "Reference";
                if (tgtDetectRawStars.hasUnreliableStars())
                    msg += " and ";
            }
            if (tgtDetectRawStars.hasUnreliableStars()){
                msg += "Target";
            }
            msg += " stars.\nIf there are too many false positives, adjust the star detection controls. " +
                "It is more important to detect most of the stars than to eliminate all false detections, " +
                "but try to avoid thousands of false positives.\n";
            console.warningln(msg);
        }
        console.write(getElapsedTime(detectStarTime) + "\n");
    }
}

/**
 * @param {StarPair[]} starPairs
 * @returns {LinearFitData} Least Square Fit between reference & target star flux
 */
function calculateScale(starPairs) {
    if (starPairs.length < 6){
        let leastSquareFit = new LeastSquareFitAlgorithm();
        for (let starPair of starPairs) {
            leastSquareFit.addValue(starPair.tgtPmStar.getStarFlux(), starPair.refPmStar.getStarFlux());
        }
        return leastSquareFit.getOriginFit();
    }
    
    let nStars = starPairs.length;
    let tgtStars = new Float64Array( nStars );
    let refStars = new  Float64Array( nStars );
    for (let i=0; i<nStars; i++){
        tgtStars[i] = starPairs[i].tgtPmStar.getStarFlux();
        refStars[i] = starPairs[i].refPmStar.getStarFlux();
    }
    let linearFunction = new LinearFunction( tgtStars, refStars );
    return new LinearFitData(linearFunction.m, linearFunction.b);
}

/**
 * Removes the worst outlier from the photometry least squares fit line
 * @param {StarPair[]} starPairs A star pair will be removed
 * @param {LinearFitData} linearFit
 * @returns {StarPair[]}
 */
function removeStarPairOutlier(starPairs, linearFit){
    let maxErr = Number.NEGATIVE_INFINITY;
    let removeStarPairIdx = -1;
    for (let i=0; i<starPairs.length; i++){
        let starPair = starPairs[i];
        // Calculate the perpendicular distance of this point from the best fit line
        let x = starPair.tgtPmStar.getStarFlux();
        let y = starPair.refPmStar.getStarFlux();
        let perpDist = Math.abs(
                (linearFit.m * x - y + linearFit.b) / Math.sqrt(linearFit.m * linearFit.m + 1));
        if (perpDist > maxErr){
            maxErr = perpDist;
            removeStarPairIdx = i;
        }
    }
    if (removeStarPairIdx !== -1){
        starPairs.splice(removeStarPairIdx, 1);
    }
    return starPairs;
}

/**
 * Calculates the max and min star flux
 * @returns {StarMinMax}
 */
function StarMinMax() {
    this.maxRefFlux = Number.NEGATIVE_INFINITY;
    this.maxTgtFlux = Number.NEGATIVE_INFINITY;
    this.minRefFlux = Number.POSITIVE_INFINITY; 
    this.minTgtFlux = Number.POSITIVE_INFINITY;

    /**
     * Find max and min for the (corrected) star flux 
     * @param {StarPair[]} starPairArray
     * @returns {undefined}
     */
    this.calculateMinMax = function(starPairArray){
        for (let starPair of starPairArray) {
            this.maxRefFlux = Math.max(this.maxRefFlux, starPair.refPmStar.getStarFlux());
            this.maxTgtFlux = Math.max(this.maxTgtFlux, starPair.tgtPmStar.getStarFlux());
            this.minRefFlux = Math.min(this.minRefFlux, starPair.refPmStar.getStarFlux());
            this.minTgtFlux = Math.min(this.minTgtFlux, starPair.tgtPmStar.getStarFlux());
        }
    };
}

/**
 * Display photometry graph of reference flux against target flux
 * @param {String} refView
 * @param {String} tgtView
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 */
function displayStarGraph(refView, tgtView, data, photometricMosaicDialog){
    let nChannels = refView.image.isColor ? 3 : 1;
    let graphDimensions;
    let graphBitmapLum;
    let graphBitmapRGB;
    let useCrosses_ = true;
    let colorStarPairs_;
    let scaleFactors_;
    
    {   // Constructor
        // The ideal width and height ratio depends on the graph line's gradient
        let graphHeight = data.smallScreen ? data.graphHeight - 300 : data.graphHeight;
        let height = photometricMosaicDialog.logicalPixelsToPhysical(graphHeight);
        let width = photometricMosaicDialog.logicalPixelsToPhysical(data.graphWidth);
        colorStarPairs_ = getColorStarPairs(nChannels, data);
        // Calculate width that keeps aspect ratio 1:1
        graphDimensions = calcGraphDimensions(colorStarPairs_);
        width = graphDimensions.getSameScaleWidth(height, 1, 1);
        if (width > 1800){
            height *= 1800 / width;
            width = graphDimensions.getSameScaleWidth(height, 1, 1);
        }
        // Display graph in script dialog
        let graphDialog = new PhotometryGraphDialog("Photometry Graph", width, height, 
            data, photometricMosaicDialog, createZoomedGraph);
        graphDialog.execute();
        
        // Help the garbage collector
        graphDialog = null;
        if (graphBitmapLum){
            graphBitmapLum.clear();
            graphBitmapLum = null;
        }
        if (graphBitmapRGB){
            graphBitmapRGB.clear();
            graphBitmapRGB = null;
        }
        colorStarPairs_ = null;
        scaleFactors_ = null;
    }
    
    /**
     * Callback function for GraphDialog to create a graph.
     * GraphDialog uses Graph.getGraphBitmap() and the function pointer Graph.screenToWorld
     * @param {Number} factor
     * @param {Number} width
     * @param {Number} height
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @param {Boolean} smallPoints If true, draw points instead of crosses
     * @param {Boolean} recalc If true recalculate star fluxes
     * @returns {Graph}
     */
    function createZoomedGraph(factor, width, height, selectedChannel, smallPoints, recalc){
        useCrosses_ = !smallPoints;
        if (!colorStarPairs_ || recalc){
            colorStarPairs_ = getColorStarPairs(nChannels, data);
        }
        if (!scaleFactors_ || recalc){
            scaleFactors_ = getScaleFactors(colorStarPairs_);
        }
        let graph = createGraph(refView.fullId, tgtView.fullId, width, height, 
            colorStarPairs_, scaleFactors_, factor, selectedChannel);
        return graph;
    }
    
    /**
     * @param {StarPair[][]} colorStarPairs StarPair[] for L or R,G,B
     * @returns {LinearFitData[]}
     */
    function getScaleFactors(colorStarPairs){
        let scaleFactors = [];
        for (let c=0; c < colorStarPairs.length; c++){
            let starPairs = colorStarPairs[c];
            let linearFitData;
            if (starPairs.length){
                linearFitData = calculateScale(starPairs);
            } else {
                linearFitData = estimateGradient(refView, tgtView, 
                    data.linearRangeRef, data.linearRangeTgt, data.cache.overlap, c);
            }
            scaleFactors.push(linearFitData);
        }
        return scaleFactors;
    }
    
    /**
     * Draw graph lines and points for a single color
     * @param {Graph} graph
     * @param {Number} lineColor e.g. 0xAARRGGBB
     * @param {StarPair[]} starPairs
     * @param {LinearFitData} linearFit
     * @param {Number} pointColor e.g. 0xAARRGGBB
     * @returns {undefined}
     */
    function drawStarLineAndPoints(graph, lineColor, starPairs, linearFit, pointColor){
        graph.drawLine(linearFit.m, linearFit.b, lineColor);
        for (let starPair of starPairs){
            if (useCrosses_){
                graph.drawCross(starPair.tgtPmStar.getStarFlux(), starPair.refPmStar.getStarFlux(), pointColor);
            } else {
                graph.drawPoint(starPair.tgtPmStar.getStarFlux(), starPair.refPmStar.getStarFlux(), pointColor);
            }
        }
    };
    
    /**
     * @param {StarPair[][]} colorStarPairs
     * @returns {GraphDimensions}
     */
    function calcGraphDimensions(colorStarPairs){
        let minMax = new StarMinMax();
        colorStarPairs.forEach(function (starPairs) {
            minMax.calculateMinMax(starPairs);
        });
        if (minMax.minRefFlux === Number.POSITIVE_INFINITY || minMax.minTgtFlux === Number.NEGATIVE_INFINITY){
            // Default scale from 0 to 1
            minMax.minRefFlux = 0;
            minMax.minTgtFlux = 0;
            minMax.maxRefFlux = 1;
            minMax.maxTgtFlux = 1;
        }
        let startOffsetX = (minMax.maxTgtFlux - minMax.minTgtFlux) / 100;
        let startOffsetY = (minMax.maxRefFlux - minMax.minRefFlux) / 100;
        // If there is only one point, min & max will be equal. Prevent zero length axis.
        if (startOffsetX === 0){
            startOffsetX = minMax.minTgtFlux !== 0 ? minMax.minTgtFlux : 0.0001;
        }
        if (startOffsetY === 0){
            startOffsetY = minMax.minRefFlux !== 0 ? minMax.minRefFlux : 0.0001;
        }
        
        return new GraphDimensions(
                minMax.minTgtFlux - startOffsetX,
                minMax.minRefFlux - startOffsetY,
                minMax.maxTgtFlux, 
                minMax.maxRefFlux, true);
    }
    
    /**
     * @param {String} referenceName
     * @param {String} targetName
     * @param {Number} width 
     * @param {Number} height
     * @param {StarPair[][]} colorStarPairs StarPair[] for each color
     * @param {LinearFitData[]} scaleFactors Lines are drawn through origin with these gradients
     * @param {Number} zoomFactor
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createGraph(referenceName, targetName, width, height, colorStarPairs, 
            scaleFactors, zoomFactor, selectedChannel){
        let targetLabel = "Target Star Flux (" + targetName + ")";
        let referenceLabel = "Reference Star Flux (" + referenceName + ")";

        if (!graphBitmapLum || graphBitmapLum.width !== width || graphBitmapLum.height !== height){
            if (graphBitmapLum){
                graphBitmapLum.clear();
            }
            graphBitmapLum = new Bitmap(width, height);
        }

        // Create the graph axis and annotation.
        let graphWithAxis = new Graph(graphDimensions, targetLabel, referenceLabel, graphBitmapLum, 
                zoomFactor, zoomFactor);

        // Now add the data to the graph...
        if (colorStarPairs.length === 1){ // B&W
            drawStarLineAndPoints(graphWithAxis, 0xFF777777, colorStarPairs[0], scaleFactors[0], 0xFFFFFFFF);
        } else {
            // Color. Need to create 3 graphs for r, g, b and then merge them (binary OR) so that
            // if three samples are on the same pixel we get white and not the last color drawn
            let lineColors = [0xFFAA0000, 0xFF00AA00, 0xFF0000FF]; // r, g, b
            let pointColors = [0xFFFF0000, 0xFF00FF00, 0xFF5555FF]; // r, g, b
            // Provided the saved bitmap is the same size, we can reuse it.
            // The Graph will fill the bitmap with zeros before using it.
            let bitmapSize = graphWithAxis.getGraphAreaOnlySize();
            if (!graphBitmapRGB || 
                    graphBitmapRGB.width !== bitmapSize.width || 
                    graphBitmapRGB.height !== bitmapSize.height){
                if (graphBitmapRGB){
                    graphBitmapRGB.clear();
                }
                graphBitmapRGB = new Bitmap(bitmapSize.width, bitmapSize.height);
            }
            for (let c = 0; c < colorStarPairs.length; c++){
                if (selectedChannel === 3 || selectedChannel === c){
                    let graphAreaOnly = graphWithAxis.graphAreaOnlyFactory(graphBitmapRGB);
                    drawStarLineAndPoints(graphAreaOnly, lineColors[c], colorStarPairs[c], scaleFactors[c], pointColors[c]);
                    graphWithAxis.mergeWithGraphAreaOnly(graphAreaOnly);
                }
            }
        }
        
        return graphWithAxis;
    }
}

/**
 * If overlay mode, return mask of overlap. Otherwise mask uses joinRect.
 * @param {PhotometricMosaicData} data
 * @param {JoinRegion} joinRegion
 * @param {Boolean} isTargetAfterRef True if target image is below or right of reference image
 * @param {String} viewId Mosaic view id
 * @return {ImageWindow}
 */
function createJoinMask(data, joinRegion, isTargetAfterRef, viewId){
    let tgtView = data.targetView;
    let overlap = data.cache.overlap;
    let title = viewId + JOIN_MASK_POSTFIX();
    const width = tgtView.image.width;
    const height = tgtView.image.height;
    // Create a white bitmap. A white mask is transparent.
    let bmp = new Bitmap(width, height);
    bmp.fill(0xffffffff);
    let isHorizontal = overlap.overlapBox.width > overlap.overlapBox.height;
    
    let taperStartPath = createTaperPath(overlap, joinRegion.getJoin(), isHorizontal);
    
    let fillJoinAreaMode = data.useCropTargetToReplaceRegion || !data.useMosaicOverlay;
    if (fillJoinAreaMode){
        // Initially fill the whole of the join area with the mask value.
        // We will deal with any non rectangular edges later.
        let joinRect = joinRegion.joinRect;
        let area = joinRect.area;
        let graphics = new Graphics(bmp);
        let brush = new Brush(0xffdddddd);
        if (data.useCropTargetToReplaceRegion){
            graphics.fillRect(joinRect, brush);
        } else {
            let joinAreaPath = createJoinAreaPath(overlap, taperStartPath, data.joinSize, isHorizontal, isTargetAfterRef);
            let polygon = taperStartPath.slice();
            for (let i = joinAreaPath.length - 1; i >= 0; i--){
                polygon.push(joinAreaPath[i]);
            }
            graphics.fillPolygon(polygon, FillRule.OddEven, brush);
        }
        graphics.end();
        
        // Now correct for a non rectangular join region.
        // If the overlapMask is black, we need to set the pixels back to white.
        const overlapMask = overlap.getFullImageMask();
        let maskSamples = overlapMask.bitsPerSample === 64 ? new Float64Array(area) : new Float32Array(area);
        overlapMask.getSamples(maskSamples, joinRect);
        const joinRectWidth = joinRect.width;
        const deltaX = joinRect.x0;
        const deltaY = joinRect.y0;
        for (let i = 0; i < maskSamples.length; i++){
            if (maskSamples[i] === 0){
                let x = deltaX + i % joinRectWidth;
                let y = deltaY + Math.floor(i / joinRectWidth);
                bmp.setPixel(x, y, 0xffffffff);
            }
        } 
    } 

    // Draw the target fully corrected to partially corrected transition.
    // Draw the end of the taper zone.
    if (isTargetAfterRef !== null){
        let graphics = new Graphics(bmp);
        graphics.antialiasing = false;
        graphics.clipRect = new Rect(width, height);
        graphics.pen = new Pen(0xff999999);
        let taperEndPath = createTaperEndPath(taperStartPath, data.taperLength, isHorizontal, isTargetAfterRef);
        for (let i=1; i < taperEndPath.length; i++){
            let x = taperEndPath[i-1].x;
            let x2 = taperEndPath[i].x;
            let y = taperEndPath[i-1].y;
            let y2 = taperEndPath[i].y;
            graphics.drawLine(x, y, x2, y2);
        } 
        graphics.pen = new Pen(0xff000000);
        for (let i=1; i < taperStartPath.length; i++){
            let x = taperStartPath[i-1].x;
            let x2 = taperStartPath[i].x;
            let y = taperStartPath[i-1].y;
            let y2 = taperStartPath[i].y;
            graphics.drawLine(x, y, x2, y2);
        } 
        graphics.end();
    }

    let w = new ImageWindow(width, height, 1, 8, false, false, title);
    let view = w.mainView;
    view.beginProcess(UndoFlag.NoSwapFile);
    view.image.blend(bmp);
    view.endProcess();  
    w.show();
    return w;
}

/**
 * @param {Star} star
 * @param {PhotometricMosaicData} data
 * @returns {Number} Star radius
 */
function calcStarMaskRadius(star, data){
    let delta = calcApertureCorrection(data.maskStarRadiusAdd, 
            data.maskStarGrowthRate, star.getStarFlux());
    return star.getStarRadius() + Math.min(data.maskStarGrowthLimit, delta);
}

/**
 * @param {Star} star
 * @param {PhotometricMosaicData} data
 * @param {Number} growthRate data.sampleStarGrowthRate or data.sampleStarGrowthRateTarget
 * @returns {Number} Star radius
 */
function calcSampleStarRejectionRadius(star, data, growthRate){
    let delta = calcApertureCorrection(data.apertureAdd, growthRate, star.getStarFlux());
    return star.getStarRadius() + delta;
}

/**
 * @param {View} tgtView
 * @param {Rect} joinArea 
 * @param {PhotometricMosaicData} data User settings used to create FITS header
 */
function createStarMask(tgtView, joinArea, data){
    let postfix = "Mask";
    let title = WINDOW_ID_PREFIX() + tgtView.fullId + "__" + Math.round(data.limitMaskStarsPercent) + "_" + postfix;
    let imageWidth = tgtView.image.width;
    let imageHeight = tgtView.image.height;
    let bmp = new Bitmap(imageWidth, imageHeight);
    bmp.fill(0xffffffff);
    let allStars = data.cache.getAllDetectedStars();
    let firstNstars;
    if (data.limitMaskStarsPercent < 100){
        firstNstars = Math.floor(allStars.length * data.limitMaskStarsPercent / 100);
    } else {
        firstNstars = allStars.length;
    }
    
    let clipRect = new Rect(joinArea);
    clipRect.deflateBy(3); // to allow for the 3 pixel soft edge growth
    let graphics;
    try {
        graphics = new Graphics(bmp);
        graphics.antialiasing = true;
        graphics.brush = new Brush();
        graphics.clipRect = clipRect;

        for (let i = 0; i < firstNstars; ++i){
            let star = allStars[i];
            let radius = calcStarMaskRadius(star, data);
            graphics.fillCircle(star.pos, radius);
        }
        for (let i = 0; i < data.manualRejectionCircles.length; ++i){
            let circle = data.manualRejectionCircles[i];
            let radius = circle.overlapRadius + data.maskStarRadiusAdd;
            graphics.fillCircle(circle.x, circle.y, radius);
        }
    } catch (e) {
        console.criticalln("StarLib createStarMask error: " + e);
    } finally {
        graphics.end();
    }
    bmp.invert();

    // Create new window and copy bitmap to its image.
    // width, height, nChannels, bitsPerSample, floatSample, color, title
    let w = new ImageWindow(imageWidth, imageHeight, 1, 8, false, false, title);
    let view = w.mainView;
    view.beginProcess(UndoFlag.NoSwapFile);
    view.image.blend(bmp);

    // Make the star edges soft
    let P = new MultiscaleLinearTransform;
    P.layers = [// enabled, biasEnabled, bias, noiseReductionEnabled, noiseReductionThreshold, noiseReductionAmount, noiseReductionIterations
        [false, true, 0.000, false, 3.000, 1.00, 1],
        [false, true, 0.000, false, 3.000, 1.00, 1],
        [true, true, 0.000, false, 3.000, 1.00, 1]
    ];
    P.transform = MultiscaleLinearTransform.StarletTransform;
    P.executeOn(w.mainView, false);
    
    // Make sure the star mask circles do not include pixels beyond the overlap.
    let overlapMask = data.cache.overlap.getFullImageMask();
    let minX = Math.max(0, joinArea.x0 - 10);
    let minY = Math.max(0, joinArea.y0 - 10);
    let maxX = Math.min(bmp.width, joinArea.x1 + 10);
    let maxY = Math.min(bmp.height, joinArea.y1 + 10);
    for (let x = minX; x < maxX; x++){
        for (let y = minY; y < maxY; y++){
            if (overlapMask.sample(x, y) === 0 && view.image.sample(x, y) !== 0){
                view.image.setSample(0, x, y);
            }
        }
    }

    let keywords = [];
    fitsHeaderImages(keywords, data);
    fitsHeaderStarDetection(keywords, data);
    fitsHeaderMask(keywords, data);
    
    w.keywords = keywords;
    view.endProcess();
    w.show();
}
