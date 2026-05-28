#engine v8

/* global StdIcon.Error, StdButton.Ok, StdButton.Yes, StdIcon.Question, StdButton.Abort, StdButton.No, StdIcon.Warning, UndoFlag.NoSwapFile, UndoFlag.Keywords, UndoFlag.PixelData */

"use strict";
#feature-id PhotometricMosaic : Mosaic EGo > PhotometricMosaic

#feature-icon @script_icons_dir/PhotometricMosaic.svg

#feature-info Creates mosaics from previously registered images, using photometry \
to determine the brightness scale factor and a surface spline to model the relative gradient.<br/>\
Copyright &copy; 2019-2021 John Murphy.<br/> \
StarDetector.jsh: Copyright &copy; 2003-2020 Pleiades Astrophoto S.L. All Rights Reserved.<br/>

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

#define DEFAULT_STAR_DETECTION -1.0
#define DEFAULT_STAR_FLUX_TOLERANCE 1.5
#define DEFAULT_STAR_SEARCH_RADIUS 2.5
#define DEFAULT_OUTLIER_PERCENT 2
#define DEFAULT_JOIN_SIZE 90
#define DEFAULT_OVERLAP_GRADIENT_SMOOTHNESS -1
#define DEFAULT_TARGET_GRADIENT_SMOOTHNESS 2

#define KEYPREFIX "PhotometricMosaic"
#define ISD_KEYPREFIX KEYPREFIX + "_ISD"
#define APERTURE_ADD 1
#define APERTURE_GROWTH 0.25
#define APERTURE_GROWTH_OVERLAP 0.25
#define APERTURE_GROWTH_TARGET 1.0
#define APERTURE_GAP 2
#define APERTURE_BKG_DELTA 10
#define LINEAR_RANGE 0.7

#define STAR_BKG_DELTA 3


#include "lib/AkimaSubsplineInterpolation.js"
#include "lib/Cache.js"
#include "lib/DetectedStarsDialog.js"
#include "lib/DialogControls.js"
#include "lib/DialogLib.js"
#include "lib/FitsHeader.js"
#include "lib/Geometry.js"
#include "lib/Gradient.js"
#include "lib/GradientGraph.js"
#include "lib/GradientGraphDialog.js"
#include "lib/Graph.js"
#include "lib/HelpDialog.js"
#include "lib/ImageScaleDialog.js"
#include "lib/JoinDialog.js"
#include "lib/LeastSquareFit.js"
#include "lib/MaskStarsDialog.js"
#include "lib/PhotometricMosaicData.js"
#include "lib/PhotometricMosaicDialog.js"
#include "lib/PreviewControl.js"
#include "lib/PhotometryStarsDialog.js"
#include "lib/PhotometryGraphDialog.js"
#include "lib/SampleGrid.js"
#include "lib/SampleGridDialog.js"
#include "lib/StarLib.js"
#include "lib/STFAutoStretch.js"
#include "extraControls/BinnedSampleGridDialog.js"

// To stop my IDE from generating warnings...
function VERSION(){return "4.0.2";}
function TITLE(){return "Photometric Mosaic";}
function SCRIPT_NAME(){return "PhotometricMosaic";}
function TRIM_NAME(){return "TrimMosaicTile";}
function MOSAIC_NAME(){return "Mosaic";}
function WINDOW_ID_PREFIX(){return "PM__";}
function JOIN_MASK_POSTFIX(){return "__JoinMask";}
function DISPLAY_DETECTED_STARS(){return 1;}
function DISPLAY_PHOTOMETRY_STARS(){return 2;}
function DISPLAY_PHOTOMETRY_GRAPH(){return 4;}
function DISPLAY_GRADIENT_SAMPLES(){return 8;}
function DISPLAY_TARGET_GRADIENT_GRAPH(){return 16;}
function DISPLAY_OVERLAP_GRADIENT_GRAPH(){return 32;}
function DISPLAY_JOIN_REGION(){return 64;}
function DISPLAY_MOSAIC_MASK_STARS(){return 128;}
function DISPLAY_SCALE_DIALOG(){return 256;}
function DISPLAY_BINNED_SAMPLES(){return 512;}

/**
 * Controller. Processing starts here!
 * @param {PhotometricMosaicData} data Values from user interface
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 */
function photometricMosaic(data, photometricMosaicDialog)
{
    let startTime = new Date().getTime();
    let targetView = data.targetView;
    let referenceView = data.referenceView;
    let nChannels = targetView.image.isColor ? 3 : 1;      // L = 0; R=0, G=1, B=2
    let overlap;

    // let the MosaicCache know about any relevant input parameter changes
    // If any of these inputs have changed, the cache will be invalidated
    data.cache.setUserInputData(referenceView.fullId, targetView.fullId,
            data.refLogStarDetection, data.tgtLogStarDetection);

    // Overlap bounding box and overlap bitmap
    if (data.cache.overlap === null){
        // Create ref/tgt overlap bitmap (overlapMask) and its bounding box (ovelapBox)
        let overlapTime = new Date().getTime();
        // Add trim warning check here so it is only displayed once
        console.noteln("\nReference: <b>", referenceView.fullId, "</b>, Target: <b>", targetView.fullId, "</b>\n");
        console.writeln("<b><u>Calculating overlap</u></b>");
        CoreApplication.processEvents();
        overlap = new Overlap(data, referenceView, targetView);
        if (!overlap.hasOverlap()){
            let errorMsg = "Error: <b>" + referenceView.fullId + "</b> and <b>" + targetView.fullId + "</b> do not overlap.";
            new MessageBox(errorMsg, TITLE(), StdIcon.Error, StdButton.Ok).execute();
            return;
        }
        data.cache.setOverlap(overlap);
        setJoinPositionRange(photometricMosaicDialog.joinPosition_Control, data, true);
        console.writeln(getElapsedTime(overlapTime) + "\n");
        CoreApplication.processEvents();
    } else {
        overlap = data.cache.overlap;
    }

    let overlapBox = overlap.overlapBox;
    if (!data.useCropTargetToReplaceRegion){
        if (overlap.tgtBoundingBoxIsOverlap()){
            let msg = "<p>The target image (<b>" + targetView.fullId +
                    "</b>) bounding box is either inside or equal to the reference image (<b>" +
                    referenceView.fullId + "</b>) bounding box.</p>" +
                    "<p>Switch to <b>Replace/Update Region</b>?</p>";
            let messageBox = new MessageBox(msg, TITLE(),
                StdIcon.Question, StdButton.Yes, StdButton.Abort);
            let response = messageBox.execute();
            if (response === StdButton.Abort){
                return;
            }
            // Set to Replace/Update Region;
            photometricMosaicDialog.enableReplaceUpdateRegion(true);
            photometricMosaicDialog.setCropTargetPreviewRect(overlapBox);
        } else if (overlap.refBoundingBoxIsOverlap()){
            // target bounding box must be bigger than the overlap to get here
            let errorMsg = "<p>Error: The reference image (<b>" + referenceView.fullId +
                    "</b>) bounding box is inside the target image (<b>" +
                    targetView.fullId + "</b>) bounding box.</p>" +
                    "<p>If this was intentional, swap the reference and target images.</p>";
            new MessageBox(errorMsg, TITLE(), StdIcon.Error, StdButton.Ok).execute();
            return;
        }
    }
    
    let isHorizontal = overlap.isHorizontalJoin();
    let isTargetAfterRef;
    let isAmbiguousFlag = false;
    if (data.useCropTargetToReplaceRegion){
        isTargetAfterRef = null;
    } else if (isHorizontal){
        isTargetAfterRef = isImageBelowOverlap(targetView.image, overlapBox, nChannels);
        let isRefAfterTarget = isImageBelowOverlap(referenceView.image, overlapBox, nChannels);
        isAmbiguousFlag = (isTargetAfterRef === isRefAfterTarget);
    } else {
        isTargetAfterRef = isImageRightOfOverlap(targetView.image, overlapBox, nChannels);
        let isRefAfterTarget = isImageRightOfOverlap(referenceView.image, overlapBox, nChannels);
        isAmbiguousFlag = (isTargetAfterRef === isRefAfterTarget);
    }
    if (isAmbiguousFlag){
        // Ambiguous case, let user decide
        let direction = isHorizontal ? "above" : "to the left of";
        let msg = "Reference:\t'" + referenceView.fullId +
            "'\nTarget:\t'" + targetView.fullId +
            "'\n\nUnable to auto detect tile order. " +
            "One reason this can happen is if the target or reference image is a subset of the other. " +
            "This might be because the target has not been registered to the reference image, " +
            "or the wrong reference or target image has been selected. If this is the case, select 'Abort'." +
            "\n\nIs the reference frame " + direction + " the target frame?";
        let messageBox = new MessageBox(msg,
                "Failed to auto detect tile order",
                StdIcon.Question, StdButton.Yes, StdButton.No, StdButton.Abort);
        let response = messageBox.execute();
        if (response === StdButton.Abort){
            return;
        }
        isTargetAfterRef = (StdButton.Yes === response);
    }
    
    let joinRegion = new JoinRegion(data);
    let joinRect = joinRegion.joinRect;
    if (joinRect === null){
        new MessageBox(joinRegion.errMsg, TITLE(), StdIcon.Error, StdButton.Ok).execute();
        return;
    }
    
    if (data.useCropTargetToReplaceRegion){
        createPreview(referenceView, joinRect, "ReplaceRegion");
    } else {
        createPreview(targetView, overlapBox, "Overlap");
    }

    if (data.useAutoPhotometry){
        photometricMosaicDialog.setLinearRangeAutoValue();
    }

    if (data.viewFlag === DISPLAY_JOIN_REGION()){
        console.writeln("\n<b><u>Displaying 'Join Size and Position' editor</u></b>");
        let overlap = data.cache.overlap;
        let dialog = new JoinDialog("Join Size and Position", overlap.refBitmap, overlap.tgtBitmap,
                data, isHorizontal, isTargetAfterRef, photometricMosaicDialog);
        dialog.execute();
        return;
    }

    if (data.viewFlag === DISPLAY_DETECTED_STARS()){
        console.writeln("\n<b><u>Displaying detected stars</u></b>");
        let overlap = data.cache.overlap;
        let dialog = new DetectedStarsDialog("Detected Stars", overlap.refBitmap, overlap.tgtBitmap,
                data, photometricMosaicDialog);
        dialog.execute();
        dialog = null;
        return;
    }

    // Force the stars to be detected now, all together. Allows neater console output.
    cacheRawStars(data.cache);
    if (data.useAutoPhotometry){
        photometricMosaicDialog.setApertureGrowthRateAutoValue(true);
    }
    CoreApplication.processEvents();

    if (data.viewFlag === DISPLAY_PHOTOMETRY_STARS()){
        console.writeln("\n<b><u>Displaying photometry stars</u></b>");
        let overlap = data.cache.overlap;
        let dialog = new PhotometryStarsDialog("Photometry Stars", overlap.refBitmap, overlap.tgtBitmap,
                data, photometricMosaicDialog);
        dialog.execute();
        dialog = null;
        return;
    }
    if (data.viewFlag === DISPLAY_PHOTOMETRY_GRAPH()){
        console.writeln("\n<b><u>Displaying photometry graph</u></b>");
        displayStarGraph(referenceView, targetView, data, photometricMosaicDialog);
        return;
    }
//    if (data.viewFlag === DISPLAY_MOSAIC_MASK_STARS()){
//        console.writeln("\n<b><u>Displaying mosaic mask stars</u></b>");
//        let dialog = new MaskStarsDialog(joinRect, data);
//        dialog.execute();
//        dialog = null;
//        return;
//    }
    if (data.viewFlag === DISPLAY_OVERLAP_GRADIENT_GRAPH()) {
        console.writeln("\n<b><u>Displaying overlap gradient graph</u></b>");
    }
    if (data.viewFlag === DISPLAY_TARGET_GRADIENT_GRAPH()) {
        console.writeln("\n<b><u>Displaying target image gradient graph</u></b>");
    }

    // Photometry stars
    let colorStarPairs = getColorStarPairs(nChannels, data);
    let scaleFactors = [];

    // Calculate the scale
    console.writeln("\n<b><u>Calculating scale</u></b>");
    for (let c = 0; c < nChannels; c++){
        let starPairs = colorStarPairs[c];
        let linearFitData;
        if (starPairs.length > 0){
            linearFitData = calculateScale(starPairs);
        } else {
            linearFitData = estimateGradient(referenceView, targetView,
                    data.linearRangeRef, data.linearRangeTgt, overlap, c);
        }
        scaleFactors.push(linearFitData);
    }

    let overlapThickness = Math.min(overlapBox.height, overlapBox.width);
    let maxSampleSize = Math.floor(overlapThickness/2);
    if (data.sampleSize > maxSampleSize){
        let recommendedSize = Math.floor(overlapThickness/3);
        new MessageBox("Sample Size '" + data.sampleSize + "' is too big for the overlap area.\n" +
                "Sample Size must be less than or equal to " + maxSampleSize +
                "\nReducing sample size to: " + recommendedSize,
                TITLE(), StdIcon.Warning, StdButton.Ok).execute();
        data.sampleSize = recommendedSize;
        photometricMosaicDialog.sampleSize_Control.setValue(data.sampleSize);
    }

    if (data.useAutoSampleGeneration){
        photometricMosaicDialog.setLimitSampleStarsPercentAutoValue(true);
        photometricMosaicDialog.setSampleStarGrowthRateAutoValue(true);
        photometricMosaicDialog.setSampleStarGrowthRateTargetAutoValue(true);
    }

    if (data.viewFlag === DISPLAY_GRADIENT_SAMPLES()){
        console.writeln("\n<b><u>Displaying sample grid</u></b>");
        let targetSide = createTaperPath(data.cache.overlap, joinRegion.getJoin(), isHorizontal);
        let dialog = new SampleGridDialog("Sample Generation",
                data, maxSampleSize, targetSide, photometricMosaicDialog);
        dialog.execute();
        dialog = null;
        return;
    }

    if (data.viewFlag === DISPLAY_SCALE_DIALOG()){
        let sampleGrid = data.cache.getSampleGrid(data);
        let colorRawSamplePairs  = sampleGrid.createRawSamplePairs(data.cache.getAllDetectedStars(), data, false);
        GradientScaleGraph(isHorizontal,
                colorRawSamplePairs, scaleFactors, photometricMosaicDialog, data);
        return;
    }

    let binnedColorSamplePairs = [];
    let colorSamplePairs = [];
    if (data.viewFlag !== DISPLAY_TARGET_GRADIENT_GRAPH()) {
        for (let c = 0; c < nChannels; c++){
            // For each color
            console.write("Scaling ", targetView.fullId, "[" + c + "] by (",
                    scaleFactors[c].m.toPrecision(5), " x ", data.adjustScale[c].toPrecision(5), ")");
            let nStarPairs = colorStarPairs[c].length;
            if (!nStarPairs){
                console.warningln(" (No stars. Calculated scale from image)");
            } else {
                let text = " (" + nStarPairs + " stars)";
                if (nStarPairs > 3){
                    console.writeln(text);
                } else {
                    console.warningln(text);
                }
            }
            CoreApplication.processEvents();
        }
        let sampleGrid = data.cache.getSampleGrid(data);
        let colorRawSamplePairs  = sampleGrid.createRawSamplePairs(data.cache.getAllDetectedStars(), data, true);
        for (let c=0; c<colorRawSamplePairs.length; c++){
            let rawSamplePairs = colorRawSamplePairs[c];
            if (rawSamplePairs.length < 3) {
                new MessageBox("Error: Too few samples to create a Surface Spline.", TITLE(), StdIcon.Error, StdButton.Ok).execute();
                return;
            }
            let samplePairs = applyScaleToSamplePairs(rawSamplePairs, scaleFactors[c].m * data.adjustScale[c]);
            colorSamplePairs.push(samplePairs);
        }

        for (let c=0; c<nChannels; c++){
            binnedColorSamplePairs[c] = createBinnedSampleGrid(overlapBox, colorSamplePairs[c],
                    isHorizontal, data.maxSamples);
        }

        if (data.viewFlag === DISPLAY_BINNED_SAMPLES()){
            console.writeln("\n<b><u>Displaying binned sample grid</u></b>");
            let overlap = data.cache.overlap;
            let dialog = new BinnedSampleGridDialog("Binned Sample Grid", overlap.refBitmap,
                    colorSamplePairs[0], isHorizontal, data, photometricMosaicDialog);
            dialog.execute();
            dialog = null;
            return;
        }

        // Calculate the gradient for each channel
        console.writeln("\n<b><u>Calculating surface spline</u></b>");
        if (binnedColorSamplePairs[0].length < colorSamplePairs[0].length){
            console.writeln("Reduced number of samples from ", colorSamplePairs[0].length,
                    " to ", binnedColorSamplePairs[0].length);
        }
    }

    if (data.viewFlag === DISPLAY_OVERLAP_GRADIENT_GRAPH()) {
        // This gradient is important at the join
        GradientGraph(isHorizontal, joinRegion, colorSamplePairs, photometricMosaicDialog,
                data, binnedColorSamplePairs);
        return;
    }

    let propagateSurfaceSplines;
    if (data.useTargetGradientCorrection && !data.useCropTargetToReplaceRegion) {
        let sampleGrid = data.cache.getSampleGrid(data);
        let colorRawSamplePairsTarget = sampleGrid.createRawSamplePairs(data.cache.getAllDetectedStars(), data, false);
        let colorSamplePairsTarget = [];
        for (let c=0; c<colorRawSamplePairsTarget.length; c++){
            let rawSamplePairs = colorRawSamplePairsTarget[c];
            if (rawSamplePairs.length < 3) {
                new MessageBox("Error: Too few samples to create a target Surface Spline.", TITLE(), StdIcon.Error, StdButton.Ok).execute();
                return;
            }
            let samplePairs = applyScaleToSamplePairs(rawSamplePairs, scaleFactors[c].m * data.adjustScale[c]);
            colorSamplePairsTarget.push(samplePairs);
        }
        let binnedColorSamplePairsTarget = [];
        for (let c=0; c<nChannels; c++){
            binnedColorSamplePairsTarget[c] = createBinnedSampleGrid(overlapBox, colorSamplePairsTarget[c],
                    isHorizontal, data.maxSamples);
        }

        if (data.viewFlag === DISPLAY_TARGET_GRADIENT_GRAPH()) {
            // This gradient is important after the edge of the overlap box
            GradientGraph(isHorizontal, joinRegion, colorSamplePairsTarget, photometricMosaicDialog,
                    data, binnedColorSamplePairsTarget);
            return;
        }

        propagateSurfaceSplines = [];
        try {
            let smoothness = data.targetGradientSmoothness;
            let consoleInfo = new SurfaceSplineInfo(binnedColorSamplePairsTarget, smoothness, 3);
            propagateSurfaceSplines = getSurfaceSplines(binnedColorSamplePairsTarget, smoothness);
            consoleInfo.end();
        } catch (ex){
            new MessageBox("Propagate Surface Spline error.\n" + ex.message,
                    TITLE(), StdIcon.Error, StdButton.Ok).execute();
            return;
        }
    } else {
        propagateSurfaceSplines = null;
    }

    let surfaceSplines = [];
    try {
        let smoothness = data.overlapGradientSmoothness;
        let consoleInfo = new SurfaceSplineInfo(binnedColorSamplePairs, smoothness, 3);
        surfaceSplines = getSurfaceSplines(binnedColorSamplePairs, smoothness);
        consoleInfo.end();
    } catch (ex){
        new MessageBox("Gradient Surface Spline error.\n" + ex.message,
                TITLE(), StdIcon.Error, StdButton.Ok).execute();
        return;
    }

    console.writeln("\n<b><u>Creating Mosaic</u></b>");

    let imageWindow = createCorrectedView(isHorizontal, isTargetAfterRef,
            scaleFactors, propagateSurfaceSplines, surfaceSplines, joinRegion, data);
    imageWindow.show();
    imageWindow.zoomToFit();

    for (let ss of surfaceSplines){
        ss.clear;
    }
    if (propagateSurfaceSplines){
        for (let ss of propagateSurfaceSplines){
            ss.clear;
        }
    }
    console.noteln("\n" + TITLE() + ": Total time ", getElapsedTime(startTime), "\n");
    CoreApplication.processEvents();
}

/**
 * @param {SamplePair[][]} binnedColorSamplePairs
 * @param {Number} smoothness
 * @returns {SurfaceSpline[]}
 */
function getSurfaceSplines(binnedColorSamplePairs, smoothness){
    let nChannels = binnedColorSamplePairs.length;
    let surfaceSplines = [];
    for (let c = 0; c < nChannels; c++) {
        let samplePairs = binnedColorSamplePairs[c];
        surfaceSplines[c] = calcSurfaceSpline(samplePairs, smoothness);
    }
    return surfaceSplines;
}

/**
 * @param {SamplePair[][]} binnedColorSamplePairs
 * @param {Number} smoothness
 * @param {Number} selectedChannel
 * @returns {Number}
 */
function SurfaceSplineInfo(binnedColorSamplePairs, smoothness, selectedChannel){
    this.startTime = new Date().getTime();
    let colors = ["Red  ", "Green", "Blue ", "RGB  "];
    let nSamples;
    if (selectedChannel < 3){
        nSamples = binnedColorSamplePairs[selectedChannel].length;
    } else {
        nSamples = binnedColorSamplePairs[0].length;
    }
    let color = binnedColorSamplePairs.length > 1 ? colors[selectedChannel] : "Luminance";
    if (smoothness !== undefined){
        console.write("Surface spline (", color, " ", nSamples, " samples, ",
                smoothness.toPrecision(2), " smoothness");
    } else {
        console.write("Surface spline for graph points (", color, " ", nSamples, " samples");
    }
    this.end = function (){
        console.writeln(", ", getElapsedTime(this.startTime), ")");
    };
}

/**
 * Appy scale and subtract the detected gradient from the target view
 * @param {Boolean} isHorizontal True if the join is horizontal
 * @param {Boolean} isTargetAfterRef True if target image is below or right of reference image
 * @param {LinearFitData[]} scaleFactors Scale for each color channel.
 * @param {SurfaceSpline[]} propagateSurfaceSplines SurfaceSpline for each color channel, propagated
 * @param {SurfaceSpline[]} surfaceSplines SurfaceSpline for each color channel, tapered
 * @param {JoinRegion} joinRegion
 * @param {PhotometricMosaicData} data
 * @returns {ImageWindow} Cloned image with corrections applied
 */
function createCorrectedView(isHorizontal, isTargetAfterRef,
        scaleFactors, propagateSurfaceSplines, surfaceSplines, joinRegion, data) {
    let applyScaleAndGradientTime = new Date().getTime();
    let refView = data.referenceView;
    let tgtView = data.targetView;
    let overlap = data.cache.overlap;
    let nChannels = scaleFactors.length;

    // Create the mosaic view
    let mosaicWindow;
    let mosaicView;
    if (data.replaceRefImage){
        // Modify the reference view so we can keep its process history
        mosaicWindow = refView.window;
        if (!data.useCropTargetToReplaceRegion){
            mosaicWindow.removeMask();
        }
        mosaicView = mosaicWindow.mainView;
        mosaicView.beginProcess(UndoFlag.PixelData | UndoFlag.Keywords);
        if (!mosaicWindow.isFloatSample){
            mosaicWindow.setSampleFormat( 32, true );
        }
    } else {
        let viewId = MOSAIC_NAME();
        let window = refView.window;
        let bitsPerSample = window.isFloatSample ? window.bitsPerSample : 32;
        mosaicWindow = new ImageWindow(1, 1, nChannels, bitsPerSample, true, nChannels > 1, viewId);
        mosaicView = mosaicWindow.mainView;
        // Start with the ref image and add then modify it with the target image
        mosaicView.beginProcess(UndoFlag.NoSwapFile);
        mosaicView.image.assign(refView.image);
    }
    
    let maskWindow;
    if (data.createJoinMask && !data.useCropTargetToReplaceRegion){
        console.noteln("Use [Ctrl+k] to show/hide the join mask.");
        maskWindow = createJoinMask(data, joinRegion, isTargetAfterRef, mosaicView.fullId);
        // Make it a small window with scroll bars
        maskWindow.geometry = new Rect(0, 0, 500, 200);
    }

    // Apply scale and gradient to the cloned image
    let tgtCorrector = new ScaleAndGradientApplier(overlap, joinRegion,
            isHorizontal, data, isTargetAfterRef);
    for (let channel = 0; channel < nChannels; channel++) {
        let scale = scaleFactors[channel].m * data.adjustScale[channel];
        let propagateSurfaceSpline = null;
        if (data.useTargetGradientCorrection && propagateSurfaceSplines){
            propagateSurfaceSpline = propagateSurfaceSplines[channel];
        }
        let surfaceSpline = surfaceSplines[channel];
        tgtCorrector.applyAllCorrections(refView, tgtView, mosaicView, scale,
                propagateSurfaceSpline, surfaceSpline, channel);
    }

    let minValue = mosaicView.image.minimum();
    let maxValue = mosaicView.image.maximum();
    if (minValue < 0 || maxValue > 1){
        mosaicView.image.truncate(0, 1);
    }

    // FITS Header
    let keywords = mosaicWindow.keywords;
    if (!data.replaceRefImage){
        copyFitsObservation(refView, keywords);
        copyFitsAstrometricSolution(refView, keywords);
        copyFitsKeywords(refView, keywords, TRIM_NAME(), SCRIPT_NAME());
        copyFitsKeywords(tgtView, keywords, TRIM_NAME(), SCRIPT_NAME());
        mosaicView.stf = refView.stf;
    }

    keywords.push(new FITSKeyword("HISTORY", "", SCRIPT_NAME() + " " + VERSION()));
    fitsHeaderImages(keywords, data);
    fitsHeaderOrientation(keywords, isHorizontal, isTargetAfterRef);

    fitsHeaderScale(keywords, data, scaleFactors);
    if (minValue < 0 || maxValue > 1){
        let minMaxValues = ": min = " + minValue.toPrecision(5) + ", max = " + maxValue.toPrecision(5);
        keywords.push(new FITSKeyword("HISTORY", "",
                SCRIPT_NAME() + ".truncated" + minMaxValues));
        console.warningln("Truncating image (min = " + minValue + ", max = " + maxValue + ")");
    }
    mosaicView.window.keywords = keywords;
    mosaicView.endProcess();

    // But show the main mosaic view.
    mosaicWindow.currentView = mosaicView;
    mosaicWindow.zoomToFit();
    if (data.createJoinMask && !data.useCropTargetToReplaceRegion){
        mosaicWindow.mask = maskWindow;
    }
    mosaicWindow.bringToFront();
    console.writeln("Created ", mosaicView.fullId, " (", getElapsedTime(applyScaleAndGradientTime), ")");
    return mosaicWindow;
}

/**
 * Create a preview if it does not already exist
 * @param {View} view
 * @param {Rect} rect
 * @param {String} previewName
 */
function createPreview(view, rect, previewName){
    let w = view.window;

    let preview = previewByIdSafe(w, previewName);
    if (!preview.isNull){
        w.modifyPreview(preview, rect, previewName);
        return;
    }

    let previews = w.previews;
    let found = false;
    for (let preview of previews){
        let r = w.previewRect( preview );
        if (r.x0 === rect.x0 && r.x1 === rect.x1 &&
                r.y0 === rect.y0 && r.y1 === rect.y1){
            found = true; // preview already exists
            break;
        }
    }
    if (!found){
        w.createPreview(rect, previewName);
    }
}

main();
