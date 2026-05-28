
//"use strict";

#define PIXEL_SIZE_DEFAULT 6
#define FOCAL_LENGTH_DEFAULT 1000

/**
 * Copy Astrometric solution from source view to target view
 * @param {View} sourceView Copy astrometric solution from this header
 * @param {FITSKeyword} keywords Append astrometric solution to this header
 */
function copyFitsAstrometricSolution(sourceView, keywords) {
    let found = false;
    for (let fitsKeyword of sourceView.window.keywords) {
        if (fitsKeyword.name === "COMMENT" &&
                fitsKeyword.comment.toLowerCase().contains("astrometric")) {
            found = true;
            keywords.push(fitsKeyword);
        } 
        if (fitsKeyword.name === "OBJCTRA" ||
                fitsKeyword.name === "OBJCTDEC" ||
                fitsKeyword.name === "EQUINOX" ||
                fitsKeyword.name === "CTYPE1" ||
                fitsKeyword.name === "CTYPE2" ||
                fitsKeyword.name === "CRPIX1" ||
                fitsKeyword.name === "CRPIX2" ||
                fitsKeyword.name === "CRVAL1" ||
                fitsKeyword.name === "CRVAL2" ||
                fitsKeyword.name === "PV1_1" ||
                fitsKeyword.name === "PV1_2" ||
                fitsKeyword.name === "CD1_1" ||
                fitsKeyword.name === "CD1_2" ||
                fitsKeyword.name === "CD2_1" ||
                fitsKeyword.name === "CD2_2" ||
                fitsKeyword.name === "CDELT1" ||
                fitsKeyword.name === "CDELT2" ||
                fitsKeyword.name === "CROTA1" ||
                fitsKeyword.name === "CROTA2"){
            keywords.push(fitsKeyword);
            found = true;
        }
    }
    return found;
}

/**
 * Copy known observation keywords from source to target fits headers.
 * The RA and DEC are not copied since these will probably be invalid.
 * @param {View} sourceView Copy observation data from this view
 * @param {FITSKeyword} keywords Append observation data to this view
 */
function copyFitsObservation(sourceView, keywords){
    let found = false;
    for (let fitsKeyword of sourceView.window.keywords) {
        if (fitsKeyword.name === "OBSERVER" ||
                fitsKeyword.name === "INSTRUME" ||
                fitsKeyword.name === "IMAGETYP" ||
                fitsKeyword.name === "FILTER" ||
                fitsKeyword.name === "XPIXSZ" ||
                fitsKeyword.name === "YPIXSZ" ||
                fitsKeyword.name === "XBINNING" ||
                fitsKeyword.name === "YBINNING" ||
                fitsKeyword.name === "TELESCOP" ||
                fitsKeyword.name === "FOCALLEN" ||
                fitsKeyword.name === "OBJECT" ||
                fitsKeyword.name === "DATE-OBS" ||
                fitsKeyword.name === "DATE-END" ||
                fitsKeyword.name === "OBSGEO-H" ||
                fitsKeyword.name === "ALT-OBS"){
            keywords.push(fitsKeyword);
            found = true;
        }
    }
    return found;
}

/**
 * @param {View} view Read FITS header from this view.
 * @param {FITSKeyword} keywords Append FITS header to this view.
 * @param {String} startsWith Copy all FITS comments that start with this.
 * @param {String} orStartsWith Copy all FITS comments that start with this.
 */
function copyFitsKeywords(view, keywords, startsWith, orStartsWith){
    let found = false;
    for (let keyword of view.window.keywords){
        if (keyword.comment.startsWith(startsWith) || 
                keyword.comment.startsWith(orStartsWith)){
            keywords.push(keyword);
            found = true;
        }
    }
    return found;
}

/**
 * 
 * @param {View} view
 * @param {String} word
 * @returns {Boolean}
 */
function searchFitsHistory(view, word){
    for (let fitsKeyword of view.window.keywords) {
        if (fitsKeyword.name === "HISTORY" && fitsKeyword.comment.contains(word))
            return true;
    }
    return false;
}

/**
 * @param {View} view
 * @param {String} name Header name
 * @returns {Boolean} True if the header exists
 */
function searchFits(view, name){
    for (let fitsKeyword of view.window.keywords) {
        if (fitsKeyword.name === name)
            return true;
    }
    return false;
}

/**
 * @param {View} view
 * @param {Number} defaultValue This value will be returned if FOCALLEN header entry is not found.
 * @returns {Number} Focal length in mm
 */
function getFocalLength(view, defaultValue){
    if (!view.isNull){
        for (let fitsKeyword of view.window.keywords) {
            if (fitsKeyword.name === "FOCALLEN")
                return Math.round(fitsKeyword.numericValue);
        }
    }
    return defaultValue;
}

/**
 * @param {View} view
 * @param {Number} defaultValue This value will be returned if XPIXSZ header entry is not found.
 * @returns {Number} Pixel size in microns
 */
function getPixelSize(view, defaultValue){
    if (!view.isNull){
        for (let fitsKeyword of view.window.keywords) {
            if (fitsKeyword.name === "XPIXSZ")
                return fitsKeyword.numericValue;
        }
    }
    return defaultValue;
}

/**
 * @param {Number} pixelSize
 * @param {Number} focalLength
 * @returns {Number}
 */
function calcDegreesPerPixel(pixelSize, focalLength){
    return ((pixelSize * 1.0e-6) / (focalLength * 1.0e-3)) * (180 / Math.PI);
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderImages(keywords, data){
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".ref: " + data.referenceView.fullId));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".tgt: " + data.targetView.fullId));
    if (data.useCropTargetToReplaceRegion &&
            data.referenceView.window.maskEnabled && !data.referenceView.window.mask.isNull){
        let maskWindow = data.referenceView.window.mask;
        keywords.push(new FITSKeyword("HISTORY", "", 
            SCRIPT_NAME() + ".mask: " + maskWindow.mainView.fullId));
    }
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderStarDetection(keywords, data){
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".refLogStarDetection: " + data.refLogStarDetection));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".tgtLogStarDetection: " + data.tgtLogStarDetection));
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderPhotometry(keywords, data){
    keywords.push(new FITSKeyword("HISTORY", "",
        SCRIPT_NAME() + ".starFluxTolerance: " + data.starFluxTolerance));
    keywords.push(new FITSKeyword("HISTORY", "",
        SCRIPT_NAME() + ".starSearchRadius: " + data.starSearchRadius));
        keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".apertureAdd: " + data.apertureAdd));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".apertureGrowthRate: " + data.apertureGrowthRate));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".apertureBgDelta: " + data.apertureBgDelta));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".limitPhotometricStarsPercent: " + data.limitPhotoStarsPercent));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".linearRangeRef: " + data.linearRangeRef));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".linearRangeTgt: " + data.linearRangeTgt));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".outlierRemovalPercent: " + data.outlierRemovalPercent));
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderJoin(keywords, data){
    if (!data.useCropTargetToReplaceRegion){
        if (!data.useMosaicOverlay){
            keywords.push(new FITSKeyword("HISTORY", "", 
                SCRIPT_NAME() + ".joinSize: " + data.joinSize));
        }
        keywords.push(new FITSKeyword("HISTORY", "", 
            SCRIPT_NAME() + ".joinPosition: " + data.joinPosition));
    }
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderGradient(keywords, data){
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".overlapStarGrowthRate: " + data.sampleStarGrowthRate));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".targetStarGrowthRate: " + data.sampleStarGrowthRateTarget));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".sampleSize: " + data.sampleSize));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".limitSampleStarsPercent: " + data.limitSampleStarsPercent));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".overlapGradientSmoothness: " + data.overlapGradientSmoothness));
    if (data.useTargetGradientCorrection){
        keywords.push(new FITSKeyword("HISTORY", "", 
            SCRIPT_NAME() + ".targetGradientSmoothness: " + data.targetGradientSmoothness));
    }
    keywords.push(new FITSKeyword("HISTORY", "",
        SCRIPT_NAME() + ".taperLength: " + data.taperLength));
}

/**
 * @param {FITSKeyword} keywords
 * @param {Boolean} isHorizontal
 * @param {Boolean} isTargetAfterRef 
 */
function fitsHeaderOrientation(keywords, isHorizontal, isTargetAfterRef){
    let orientation;
    if (isTargetAfterRef === null){
        orientation = "Insert";
    } else {
        orientation = isHorizontal ? "Horizontal" : "Vertical";
        keywords.push(new FITSKeyword("HISTORY", "", 
            SCRIPT_NAME() + ".isTargetAfterRef: " + isTargetAfterRef)); 
    }
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".orientation: " + orientation)); 
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderMosaic(keywords, data){
    let mode = "unknown";
    if (data.useMosaicAverage){
        mode = "Average";
    } else if (data.useMosaicOverlay){
        mode = "Overlay";
    } else if (data.useMosaicRandom){
        mode = "Blend";
    }
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".combinationMode: " + mode));
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 * @param {LinearFitData[]} scaleFactors
 */
function fitsHeaderScale(keywords, data, scaleFactors){
    for (let c = 0; c < scaleFactors.length; c++){
        keywords.push(new FITSKeyword("HISTORY", "", 
            SCRIPT_NAME() + ".scale[" + c + "]: " + 
                    scaleFactors[c].m.toPrecision(5) + " x " +
                    data.adjustScale[c].toPrecision(5)));
    }
}

/**
 * @param {FITSKeyword} keywords
 * @param {PhotometricMosaicData} data
 */
function fitsHeaderMask(keywords, data){
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".limitMaskStarsPercent: " + data.limitMaskStarsPercent));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".maskStarGrowthRate: " + data.maskStarGrowthRate));
        keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".maskStarGrowthLimit: " + data.maskStarGrowthLimit));
    keywords.push(new FITSKeyword("HISTORY", "", 
        SCRIPT_NAME() + ".maskStarRadiusAdd: " + data.maskStarRadiusAdd));
}
