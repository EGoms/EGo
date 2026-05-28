/* global StdButton.Yes, UndoFlag.NoSwapFile */

//"use strict";

/**
 * @param {Point} point 
 * @param {Number} value 
 * @returns {Point:point, Number:value}
 */
function ValueAtXY(point, value){
    return {point: point, value: value};
}

/**
 * Calculates maximum and minimum values for unsmoothed values along the join path
 * @param {ValueATXY[][]} valueAtXYArrays ValueAtXY[] for each channel
 * @param {Number} minRange The range will be at least this big
 * @param {Number} zoomFactor Zoom in by modifying minDif and maxDif (smaller
 * range produces a more zoomed in view)
 * @param {Number} selectedChannel R=0, G=1, B=2, All=3
 * @returns {ValueAtXYMinMax}
 */
function ValueAtXYMinMax(valueAtXYArrays, minRange, zoomFactor, selectedChannel) {
    let values = [];
    for (let c=0; c<valueAtXYArrays.length; c++) {
        if (selectedChannel === 3 || selectedChannel === c){
            let valueAtXYArray = valueAtXYArrays[c];
            for (let valueAtXY of valueAtXYArray) {
                values.push(valueAtXY.value);
            }
        }
    }
    let minMax = calcAxisMinMax(values, minRange, zoomFactor);
    this.minDif = minMax.min;
    this.maxDif = minMax.max;
}

/**
 * Calculates maximum and minimum values for the sample points
 * @param {SamplePair[][]} colorSamplePairs SamplePair[] for each channel
 * @param {Number} minRange The range will be at least this big
 * @param {Number} zoomFactor Zoom in by modifying minDif and maxDif (smaller
 * range produces a more zoomed in view)
 * @param {Number} selectedChannel R=0, G=1, B=2, All=3
 * @returns {SamplePairDifMinMax}
 */
function SamplePairDifMinMax(colorSamplePairs, minRange, zoomFactor, selectedChannel) {
    let values = [];
    for (let c=0; c<colorSamplePairs.length; c++) {
        if (selectedChannel === 3 || selectedChannel === c){
            let samplePairs = colorSamplePairs[c];
            for (let samplePair of samplePairs) {
                let dif = samplePair.getDifference();
                values.push(dif);
            }
        }
    }
    let minMax = calcAxisMinMax(values, minRange, zoomFactor);
    this.minDif = minMax.min;
    this.maxDif = minMax.max;
}

/**
 * @param {Number[]} values
 * @param {Number} minRange The range will be at least this big
 * @param {Number} zoomFactor zoomFactor Zoom in by modifying minDif and maxDif (smaller
 * range produces a more zoomed in view)
 * @returns {{Number} min, {Number} max}} Axis minimum and maximum values
 */
function calcAxisMinMax(values, minRange, zoomFactor){
    let minValue = values.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    let maxValue = values.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
    let dataRange = maxValue - minValue;
    let range = Math.max(dataRange, minRange) / zoomFactor;
    if (range > dataRange){
        // All points fit on the graph. Provide equal space above and below.
        let space = (range - dataRange) / 2;
        maxValue += space;
        minValue -= space;
    } else if (range < dataRange){
        // The points don't all fit on the graph. Center on median value.
        let median = Math.median(values);
        let max = median + range / 2;
        let min = median - range / 2;
        if (maxValue < max){
            let dif = max - maxValue;
            max -= dif;
            min -= dif;
        } else if (minValue > min){
            let dif = minValue - min;
            max += dif;
            min += dif;
        }
        maxValue = max;
        minValue = min;
    }
    return {min:minValue, max:maxValue};
}

/**
 * @param {ValueAtXY[][]} valueAtXYArrays Values along the join line
 * @param {Number} minRange
 * @returns {Number}
 */
function getValueAtXYNoiseRange(valueAtXYArrays, minRange){
    let rangeArray = [];
    for (let c=0; c<valueAtXYArrays.length; c++) {
        let valueAtXYArray = valueAtXYArrays[c];
        for (let i = 0; i < valueAtXYArray.length - 10; i += 10){
            let max = valueAtXYArray[i].value;
            let min = max;
            for (let j = 1; j<10; j++){
                let value = valueAtXYArray[i+j].value;
                max = Math.max(value, max);
                min = Math.min(value, min);
            }
            rangeArray.push(max - min);
        }
    }
    let range = rangeArray.length > 0 ? Math.median(rangeArray) : minRange;
    return range;
}

/**
 * @param {SamplePair[][]} samplePairsOnPath Sorted by distance along join
 * @param {Number} minRange
 * @returns {Number}
 */
function getNoiseRange(samplePairsOnPath, minRange){
    let rangeArray = [];
    for (let c=0; c<samplePairsOnPath.length; c++) {
        let samplePairs = samplePairsOnPath[c];
        for (let i = 0; i < samplePairs.length - 10; i += 10){
            let max = samplePairs[i].getDifference();
            let min = max;
            for (let j = 1; j<10; j++){
                let difference = samplePairs[i+j].getDifference();
                max = Math.max(difference, max);
                min = Math.min(difference, min);
            }
            rangeArray.push(max - min);
        }
    }
    let range = rangeArray.length > 0 ? Math.median(rangeArray) : minRange;
    return range;
}

/**
* @param {Point} p
* @param {Number} rejectionRadius
*/
function RejectionCircle(p, rejectionRadius){
    this.point = p;
    this.radius = rejectionRadius;
    const minX = p.x - rejectionRadius;
    const maxX = p.x + rejectionRadius;
    const minY = p.y - rejectionRadius;
    const maxY = p.y + rejectionRadius;
    const rSquared = rejectionRadius * rejectionRadius;
    /**
    * @param {Point} point
    * @returns {Boolean} True if the point or circle intersects with the rejection circle 
    */
    this.isInsideCircle = function(point){
       if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY){
           return false;
       }
       let xDif = point.x - p.x;
       let yDif = point.y - p.y;
       return (xDif * xDif + yDif * yDif < rSquared);
    };
}

/**
* Get all star and manual rejection circles
* @param {NsgData} data
* @param {Boolean} isTargetGradientGraph
* @returns {RejectionCircle[]}
*/
function getAllRejectionCircles(data, isTargetGradientGraph){
    // Star rejection circles
    let stars = data.cache.getDetectedRefStars().getStars();
    // growthRate data.sampleStarGrowthRate or data.sampleStarGrowthRateTarget
    let growthRate = isTargetGradientGraph ? data.sampleStarGrowthRateTarget : data.sampleStarGrowthRate;
    let firstNstars;
    if (data.limitSampleStarsPercent < 100){
        firstNstars = Math.floor(stars.length * data.limitSampleStarsPercent / 100);
    } else {
        firstNstars = stars.length;
    }
    let rejectionCircles = [];
    for (let i=0; i<firstNstars; i++){
        let star = stars[i];
        let starRadius = calcSampleStarRejectionRadius(star, data, growthRate);
        rejectionCircles.push(new RejectionCircle(star.pos, starRadius));
    }
    // Manual Rejection Circles
    for (let circle of data.manualRejectionCircles){
        let radius = isTargetGradientGraph ? circle.targetRadius : circle.overlapRadius;
        rejectionCircles.push(new RejectionCircle(new Point(circle.x, circle.y), radius));
    }
    return rejectionCircles;
}

/**
 * Returns the SamplePairs that are closest to the graphLinePath
 * @param {Point[]} graphLinePath
 * @param {SamplePair[][]} colorSamplePairs
 * @param {Number} maxDist If > 0 limit to samples less than this distance from join line
 * @param {Boolean} isHorizontal
 * @returns {SamplePair[][]} SamplePair are sorted by distance along join
 */
function getSamplePairsNearLine(graphLinePath, colorSamplePairs, maxDist, isHorizontal){
    /**
     * @param {SamplePair} samplePair
     * @param {Point[]} path 
     * @param {Boolean} isHorizontal
     * @returns {GradientGraph.getSamplePairsNearLine.MapEntry} contains {samplePair, dif, pathIdx}
     */
    function MapEntry (samplePair, path, isHorizontal){
        this.samplePair = samplePair;
        this.dist = Number.POSITIVE_INFINITY;
        this.pathIdx = -1;
        if (isHorizontal){
            let minCoord = path[0].x;
            this.pathIdx = Math.round(samplePair.rect.center.x) - minCoord;
            if (this.pathIdx >= 0 && this.pathIdx < path.length){
                this.dist = Math.abs(samplePair.rect.center.y - path[this.pathIdx].y);
            } else {
                console.criticalln("getSamplePairsNearLine: Out of range!");
            }
        } else {
            let minCoord = path[0].y;
            this.pathIdx = Math.round(samplePair.rect.center.y) - minCoord;
            if (this.pathIdx >= 0 && this.pathIdx < path.length){
                this.dist = Math.abs(samplePair.rect.center.x - path[this.pathIdx].x);
            } else {
                console.criticalln("getSamplePairsNearLine: Out of range!");
            }
        }
    }

    let dataSamplePairs = [];
    let nChannels = colorSamplePairs.length;
    for (let c=0; c<nChannels; c++){
        dataSamplePairs[c] = [];
        let pathMap = new Map();
        for (let i=0; i<colorSamplePairs[c].length; i++){
            let samplePairs = colorSamplePairs[c];
            let value = new MapEntry(samplePairs[i], graphLinePath, isHorizontal);
            if (maxDist <= 0 || value.dist < maxDist){
                let key = value.pathIdx;
                if (pathMap.has(key)){
                    let mapValue = pathMap.get(key);
                    if (value.dist < mapValue.dist){
                        // closer to path
                        pathMap.set(key, value);
                    }
                } else {
                    pathMap.set(key, value);
                }
            }
        }

        // Get values from map and convert to an array.
        for (let mapValue of pathMap.values()){
            dataSamplePairs[c].push(mapValue.samplePair);
        }
        if (isHorizontal){
            dataSamplePairs[c].sort((a, b) => a.rect.x0 - b.rect.x0);
        } else {
            dataSamplePairs[c].sort((a, b) => a.rect.y0 - b.rect.y0);
        }
        pathMap.clear();
    }

    return dataSamplePairs;
}

/**
 * Display overlap or target gradient graph
 * @param {Boolean} isHorizontal
 * @param {JoinRegion} joinRegion Create dif arrays at the join position 
 * @param {SamplePair[][]} colorSamplePairs The SamplePair points, corrected for scale
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @param {PhotometricMosaicData} data User settings used to create FITS header
 * @param {SamplePair[][]} binnedColorSamplePairs
 * @returns {undefined}
 */
function GradientGraph(isHorizontal, joinRegion, colorSamplePairs, photometricMosaicDialog, data, binnedColorSamplePairs){
    let valuesAtXYArrays_;
    let graphLinePath_;      // Display the gradient along this line
    let minScaleDif_ = 1e-9;
    let surfaceSplinesCache_ = new Map();
    let graphBitmapLum;
    let graphBitmapRGB;
    let joinRect = joinRegion.joinRect;
    
    function construct(){
        let title = "Gradient Graph";
        graphLinePath_ = createTaperPath(data.cache.overlap, joinRegion.getJoin(), isHorizontal);
        if (data.viewFlag === DISPLAY_OVERLAP_GRADIENT_GRAPH()){
            title += " (Overlap region)";
        } else {
            title += " (Target image)";
        }
        
        valuesAtXYArrays_ = calcGraphPoints(graphLinePath_);
        // Graph scale
        minScaleDif_ = 10 * getValueAtXYNoiseRange(valuesAtXYArrays_, minScaleDif_);
        
        // Display graph in script dialog
        let isColor = colorSamplePairs.length > 1;
        let graphDialog = new GradientGraphDialog(title, data, isColor, 
                createZoomedGradientGraph, photometricMosaicDialog, false);
        graphDialog.execute();
        
        // Dialog has closed. Clear cache
        graphDialog = null;
        valuesAtXYArrays_ = null;
        graphLinePath_ = null;
        for (let surfaceSpline of surfaceSplinesCache_.values()) {
            surfaceSpline.clear();
        }
        surfaceSplinesCache_.clear();
        if (graphBitmapLum){
            graphBitmapLum.clear();
            graphBitmapLum = null;
        }
        if (graphBitmapRGB){
            graphBitmapRGB.clear();
            graphBitmapRGB = null;
        }
    }
    
    /**
     * @param {Point[]} graphLinePath
     * @returns {ValueAtXY[][]}
     */
    function calcGraphPoints(graphLinePath){
        function isRejected(rejectionCircles, point){
            for (let rejectionCircle of rejectionCircles){
                if (rejectionCircle.isInsideCircle(point)){
                    return true;
                }
            }
            return false;
        }
        
        const selectedChannel = 3;    // R=0, G=1, B=2, All=3
        let pointsSurfaceSplines = getSurfaceSplinesArray(selectedChannel, undefined);
        const graphLinePathLen = graphLinePath.length;
        let valueAtXYArrays = [];
        try {
            const nChannels = pointsSurfaceSplines.length;
            const isTargetGradientGraph = data.viewFlag !== DISPLAY_OVERLAP_GRADIENT_GRAPH();
            let rejectionCircles = getAllRejectionCircles(data, isTargetGradientGraph);
            const inc = Math.max(1, Math.round(graphLinePathLen/200));    // Approximately 200 points
            for (let c=0; c<nChannels; c++){
                valueAtXYArrays[c] = [];
                if (pointsSurfaceSplines[c]){   // We might only be display one channel on the graph
                    for (let i = 0; i < graphLinePathLen; i+=inc){
                        let point = graphLinePath[i];
                        if (!isRejected(rejectionCircles, point)){
                            let value = pointsSurfaceSplines[c].evaluate(point);
                            valueAtXYArrays[c].push(new ValueAtXY(point, value));
                        }
                    }
                }
            }
        } catch (error){
            console.criticalln(error);
        }
        return valueAtXYArrays;
    }

   /**
     * Callback function for GraphDialog to provide an overlap or target zoomed gradient graph.
     * GraphDialog uses Graph.getGraphBitmap() and the function pointer Graph.screenToWorld
     * @param {Number} factor
     * @param {Number} width
     * @param {Number} height
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createZoomedGradientGraph(factor, width, height, selectedChannel){
        let smoothness;
        let isOverlapSurfaceSpline = (data.viewFlag === DISPLAY_OVERLAP_GRADIENT_GRAPH());
        if (isOverlapSurfaceSpline){
            smoothness = data.overlapGradientSmoothness;
        } else {
            smoothness = data.targetGradientSmoothness;
        }
        let surfaceSplines = getSurfaceSplinesArray(selectedChannel, smoothness);
        
        // Using GradientGraph function call parameters
        let graph = createGraph(width, height, isHorizontal, surfaceSplines, graphLinePath_,
                joinRect, valuesAtXYArrays_, data, factor, selectedChannel);
        return graph;
    }
   
    /**
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @param {Number|undefined} smoothness Use undefined for no smoothing
     * @returns {SurfaceSline[]}
     */
    function getSurfaceSplinesArray(selectedChannel, smoothness){
        let nChannels = binnedColorSamplePairs.length;
        let surfaceSplines = [];
        for (let c = 0; c < nChannels; c++) {
            if (selectedChannel === c || selectedChannel === 3){
                let key = "_" + smoothness + "_" + c + "_";
                let value = surfaceSplinesCache_.get(key);
                if (value === undefined){
                    let consoleInfo = new SurfaceSplineInfo(binnedColorSamplePairs, smoothness, c);
                    let samplePairs = binnedColorSamplePairs[c];
                    value = calcSurfaceSpline(samplePairs, smoothness);
                    surfaceSplinesCache_.set(key, value);
                    consoleInfo.end();
                }
                surfaceSplines[c] = value;
            } else {
                surfaceSplines[c] = null;
            }
        }
        return surfaceSplines;
    }
    
    /**
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} isHorizontal
     * @param {SurfaceSpline[]} surfaceSplines Difference between reference and target images
     * @param {Point[]} graphLinePath The path of the join, or overlap bounding box edge
     * @param {Rect} joinRect Join region or overlap bounding box 
     * @param {ValueAtXY[][]} valuesAtXYArrays The graph points to be displayed for each channel
     * @param {PhotometricMosaicData} data User settings used to create FITS header
     * @param {Number} zoomFactor Zoom factor for vertical axis only zooming.
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createGraph(width, height, isHorizontal, surfaceSplines, graphLinePath,
                joinRect, valuesAtXYArrays, data, zoomFactor, selectedChannel){
        let xLabel;
        if (isHorizontal){
            xLabel = "Mosaic tile join X-coordinate";
        } else {
            xLabel = "Mosaic tile join Y-coordinate";
        }
        let yLabel = "(" + data.targetView.fullId + ") - (" + data.referenceView.fullId + ")";
        let yCoordinateRange = new ValueAtXYMinMax(valuesAtXYArrays, minScaleDif_, zoomFactor, selectedChannel);
        
        return createAndDrawGraph(xLabel, yLabel, yCoordinateRange, width, height, isHorizontal, 
                surfaceSplines, graphLinePath, joinRect, valuesAtXYArrays, selectedChannel);
    }
    
    /**
     * Draw gradient line and sample points for a single color channel.
     * @param {Graph} graph
     * @param {Boolean} isHorizontal
     * @param {Number[]} difArray Points to plot. Offset difference between ref and tgt
     * @param {Number} difArrayOffset
     * @param {Number} lineColor
     * @param {ValueAtXY[]} valuesAtXYArray
     * @param {Number} pointColor
     * @returns {undefined}
     */
    function drawLineAndPoints(graph, isHorizontal,
            difArray, difArrayOffset, lineColor, valuesAtXYArray, pointColor) {
                
        for (let valueAtXY of valuesAtXYArray) {
            // Draw the sample points
            let coord = isHorizontal ? valueAtXY.point.x : valueAtXY.point.y;
            graph.drawCross(coord, valueAtXY.value, pointColor);
        }
        graph.drawCurve(difArray, difArrayOffset, lineColor, true);
    }
    
    /**
     * 
     * @param {String} xLabel
     * @param {String} yLabel
     * @param {SamplePairDifMinMax} yCoordinateRange 
     * @param {Number} width 
     * @param {Number} height 
     * @param {Boolean} isHorizontal
     * @param {SurfaceSpline[]} surfaceSplines
     * @param {Point[]} graphLinePath
     * @param {Rect} joinRect
     * @param {ValueAtXY[][]} valuesAtXYArrays
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createAndDrawGraph(xLabel, yLabel, yCoordinateRange, width, height, 
            isHorizontal, surfaceSplines, graphLinePath, joinRect, valuesAtXYArrays, selectedChannel){
        let maxY = yCoordinateRange.maxDif;
        let minY = yCoordinateRange.minDif;
        let minX;
        let maxX;
        if (isHorizontal){
            minX = joinRect.x0;
            maxX = joinRect.x1;
        } else {
            minX = joinRect.y0;
            maxX = joinRect.y1;
        }
        if (!graphBitmapLum || graphBitmapLum.width !== width || graphBitmapLum.height !== height){
            if (graphBitmapLum){
                graphBitmapLum.clear();
            }
            graphBitmapLum = new Bitmap(width, height);
        }
        let graphDimensions = new GraphDimensions(minX, minY, maxX, maxY, true);
        let graph = new Graph(graphDimensions, xLabel, yLabel, graphBitmapLum, 1, 1);
        let difArrayOffset = isHorizontal ? graphLinePath[0].x : graphLinePath[0].y;
        
        if (valuesAtXYArrays.length === 1){ // B&W
            let difArray = surfaceSplines[0].evaluate(graphLinePath).toArray();
            drawLineAndPoints(graph, isHorizontal,
                difArray, difArrayOffset, 0xFF990000, valuesAtXYArrays[0], 0xFFFFFFFF);
        } else {
            // Color. Need to create 3 graphs for r, g, b and then merge them (binary OR) so that
            // if three samples are on the same pixel we get white and not the last color drawn
            let lineColors = [0xFF990000, 0xFF009900, 0xFF000099]; // r, g, b
            let pointColors = [0xFFFF0000, 0xFF00FF00, 0xFF5555FF]; // r, g, b
            // Provided the saved bitmap is the same size, we can reuse it.
            // The Graph will fill the bitmap with zeros before using it.
            let bitmapSize = graph.getGraphAreaOnlySize();
            if (!graphBitmapRGB || 
                    graphBitmapRGB.width !== bitmapSize.width || 
                    graphBitmapRGB.height !== bitmapSize.height){
                if (graphBitmapRGB){
                    graphBitmapRGB.clear();
                }
                graphBitmapRGB = new Bitmap(bitmapSize.width, bitmapSize.height);
            }
            for (let c = 0; c < valuesAtXYArrays.length; c++){
                if (selectedChannel === 3 || selectedChannel === c){
                    let difArray = surfaceSplines[c].evaluate(graphLinePath).toArray();
                    let graphAreaOnly = graph.graphAreaOnlyFactory(graphBitmapRGB);
                    drawLineAndPoints(graphAreaOnly, isHorizontal,
                        difArray, difArrayOffset, lineColors[c], valuesAtXYArrays[c], pointColors[c]);
                    graph.mergeWithGraphAreaOnly(graphAreaOnly);
                }
            }
        }
        return graph;
    }
    
    construct();
}

/**
 * Display Adjust Scale gradient graph to determine scale correction
 * @param {Boolean} isHorizontal
 * @param {SamplePair[][]} colorRawSamplePairs The SamplePair points without scale correction
 * @param {LinearFit[]} scaleFactors
 * @param {PhotometricMosaicDialog} photometricMosaicDialog
 * @param {PhotometricMosaicData} data adjustScale[] and for user settings used to create FITS header
 */
function GradientScaleGraph(isHorizontal,
        colorRawSamplePairs, scaleFactors, photometricMosaicDialog, data){
    
    let joinSamplePairs_;
    let gradientPath_;
    let minScaleDif_ = 1e-9;
    let graphBitmapLum;
    let graphBitmapRGB;
    
    let gradientPathRect_;
            
    function construct(){
        let title = "Adjust Scale";
        
        updatePath();
        
        // Display graph in script dialog
        let isColor = colorRawSamplePairs.length > 1;
        let graphDialog = new GradientGraphDialog(title, data, isColor, 
                createZoomedGradientGraph, photometricMosaicDialog, true);
        graphDialog.execute();
        
        // Dialog has closed. Clear cache
        graphDialog = null;
        joinSamplePairs_ = null;
        gradientPath_ = null;
        
        if (graphBitmapLum){
            graphBitmapLum.clear();
            graphBitmapLum = null;
        }
        if (graphBitmapRGB){
            graphBitmapRGB.clear();
            graphBitmapRGB = null;
        }
    }
    
    /**
     * Call this after user has modified gradient line path
     * Calculates gradientPath_, joinSamplePairs_ and minScaleDif_
     */
    function updatePath(){
        let overlapBox = data.cache.overlap.overlapBox;
        let position;
        if (isHorizontal){
            let pMid = Math.floor(overlapBox.height / 2.0);
            let y = overlapBox.y0 + pMid + data.adjustScaleLineOffset;
            position = y;
            gradientPathRect_ = new Rect(overlapBox.x0, y, overlapBox.x1, y);
        } else {
            let pMid = Math.floor(overlapBox.width / 2.0);
            let x = overlapBox.x0 + pMid + data.adjustScaleLineOffset;
            position = x;
            gradientPathRect_ = new Rect(x, overlapBox.y0, x, overlapBox.y1);
        }
        
        // Path along the center of our zero pixel thick line
        gradientPath_ = createTaperPath(data.cache.overlap, position, isHorizontal);

        // Get the SamplePairs that are closest to the line path
        let maxDist = data.sampleSize * 1.5;
        joinSamplePairs_ = getSamplePairsNearLine(gradientPath_, colorRawSamplePairs, maxDist, isHorizontal);
        
        /** 
         * @param {SamplePair[][]} colSamplePairs
         * @param {Number} minScaleDif minimum limit for noise range
         * @returns {Number} Median of the noise range, peak to peak
         */
        function calcMinVerticalScaleRange(colSamplePairs, minScaleDif){
            // calculate minimum vertical scale range
            let colorSamplePairsTmp = [];
            for (let c = 0; c < colSamplePairs.length; c++){
                let rawSamplePairs = colSamplePairs[c];
                let samplePairs = applyScaleToSamplePairs(rawSamplePairs, scaleFactors[c].m);
                colorSamplePairsTmp.push(samplePairs);
            }
            return 10 * getNoiseRange(colorSamplePairsTmp, minScaleDif);
        }
        
        minScaleDif_ = calcMinVerticalScaleRange(joinSamplePairs_, minScaleDif_);
    }
    
    /**
     * Callback function for GraphDialog to provide a zoomed graph (Adjust Scale graph).
     * GraphDialog uses Graph.getGraphBitmap() and the function pointer Graph.screenToWorld
     * @param {Number} factor
     * @param {Number} width
     * @param {Number} height
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createZoomedGradientGraph(factor, width, height, selectedChannel){
        updatePath();
        let colorSamplePairs = [];
        let nColors = joinSamplePairs_.length;
        for (let c = 0; c < nColors; c++){
            let rawSamplePairs = joinSamplePairs_[c];
            let samplePairs = applyScaleToSamplePairs(rawSamplePairs, scaleFactors[c].m * data.adjustScale[c]);
            colorSamplePairs.push(samplePairs);
        }
        
        // Using GradientGraph function call parameters
        let graph = createGraph(width, height, isHorizontal,
                gradientPathRect_, colorSamplePairs, data, factor, selectedChannel);
        return graph;
    }
    
    /**
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} isHorizontal
     * @param {Rect} joinRect Join region or overlap bounding box 
     * @param {SamplePair[][]} dataSamplePairs The SamplePair points to be displayed for each channel
     * @param {PhotometricMosaicData} data User settings used to create FITS header
     * @param {Number} zoomFactor Zoom factor for vertical axis only zooming.
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createGraph(width, height, isHorizontal,
                joinRect, dataSamplePairs, data, zoomFactor, selectedChannel){
        let xLabel;
        if (isHorizontal){
            xLabel = "Mosaic tile join X-coordinate";
        } else {
            xLabel = "Mosaic tile join Y-coordinate";
        }
        let yLabel = "(" + data.targetView.fullId + ") - (" + data.referenceView.fullId + ")";
        let yCoordinateRange = new SamplePairDifMinMax(dataSamplePairs, minScaleDif_, zoomFactor, selectedChannel);
        
        return createAndDrawGraph(xLabel, yLabel, yCoordinateRange, width, height, isHorizontal, 
                joinRect, dataSamplePairs, selectedChannel);
    }
    
    /**
     * Draw gradient line and sample points for a single color channel.
     * @param {Graph} graph
     * @param {Boolean} isHorizontal
     * @param {Number} lineColor 
     * @param {SamplePair[]} samplePairs
     * @param {Number} pointColor
     */
    function drawLineAndPoints(graph, isHorizontal, lineColor, samplePairs, pointColor) {
        drawLine(graph, isHorizontal, samplePairs, lineColor);
        for (let samplePair of samplePairs) {
            // Draw the sample points
            let coord = isHorizontal ? samplePair.rect.center.x : samplePair.rect.center.y;
            graph.drawCross(coord, samplePair.getDifference(), pointColor);
        }
    }
    
    /**
     * @param {Graph} graph
     * @param {Boolean} isHorizontal
     * @param {SamplePair[]} samplePairs
     * @param {Number} lineColor
     */
    function drawLine(graph, isHorizontal, samplePairs, lineColor){
        /**
         * @param {Number[]} values This array is modified (sorted)
         * @returns {Number} The median of the input array
         */
        function medianOfArray(values) {
            values = values.sort(function (a, b) { return a - b; });
            const length = values.length;
            if (length % 2 === 1) {
                // length is odd; use middle element
                return values[(length / 2) - .5];
            }
            else {
                return (values[length / 2] + values[(length / 2) - 1]) / 2;
            }
        }
        
        const useMedian = false;
        const plusMinusRange = 4; // For example, 3 produces a running average from -3 to + 3; 7 points
        const nPoints = plusMinusRange * 2 + 1;
        let xArray = [];
        let yArray = [];
        const length = samplePairs.length - plusMinusRange;
        for (let i = plusMinusRange; i < length; i++){
            let sumX = 0;
            let sumY = 0;
            let medianArray = [];
            for (let j = i - plusMinusRange; j <= i + plusMinusRange; j++){
                let rect = samplePairs[j].rect;
                let x = isHorizontal ? rect.center.x : rect.center.y;
                sumX += x;
                if (useMedian){
                    medianArray.push(samplePairs[j].getDifference());
                } else {
                    sumY += samplePairs[j].getDifference();
                }
            }
            xArray.push(sumX / nPoints);
            if (useMedian){
                yArray.push(medianOfArray(medianArray));
            } else {
                yArray.push(sumY / nPoints);
            }
        }
        if (xArray.length > 4){
            let curve = new AkimaInterpolation(xArray, yArray);
            let curvePoints = [];
            let firstX = Math.round(xArray[0]);
            let xLimit = Math.round(xArray[xArray.length - 1]) + 1;
            for (let x = firstX; x < xLimit; x++){
                let y = curve.evaluate(x);
                curvePoints.push(y);
            }
            graph.drawCurve(curvePoints, firstX, lineColor, false);
        }  
    }
    
    /**
     * 
     * @param {String} xLabel
     * @param {String} yLabel
     * @param {SamplePairDifMinMax} yCoordinateRange 
     * @param {Number} width 
     * @param {Number} height 
     * @param {Boolean} isHorizontal
     * @param {Rect} joinRect
     * @param {SamplePair[][]} dataSamplePairs
     * @param {Number} selectedChannel R=0, G=1, B=2, All=3
     * @returns {Graph}
     */
    function createAndDrawGraph(xLabel, yLabel, yCoordinateRange, width, height, 
            isHorizontal, joinRect, dataSamplePairs, selectedChannel){
        let maxY = yCoordinateRange.maxDif;
        let minY = yCoordinateRange.minDif;
        let minX;
        let maxX;
        if (isHorizontal){
            minX = joinRect.x0;
            maxX = joinRect.x1;
        } else {
            minX = joinRect.y0;
            maxX = joinRect.y1;
        }
        if (!graphBitmapLum || graphBitmapLum.width !== width || graphBitmapLum.height !== height){
            if (graphBitmapLum){
                graphBitmapLum.clear();
            }
            graphBitmapLum = new Bitmap(width, height);
        }
        let graphDimensions = new GraphDimensions(minX, minY, maxX, maxY, true);
        let graph = new Graph(graphDimensions, xLabel, yLabel, graphBitmapLum, 1, 1);
        
        if (dataSamplePairs.length === 1){ // B&W
            drawLineAndPoints(graph, isHorizontal, 0xFF770000, dataSamplePairs[0], 0xFFFFFFFF);
        } else {
            // Color. Need to create 3 graphs for r, g, b and then merge them (binary OR) so that
            // if three samples are on the same pixel we get white and not the last color drawn
            let lineColors = [0xFF660000, 0xFF006600, 0xFF0000AA]; // r, g, b
            let pointColors = [0xFFFF0000, 0xFF00FF00, 0xFF5555FF]; // r, g, b
            // Provided the saved bitmap is the same size, we can reuse it.
            // The Graph will fill the bitmap with zeros before using it.
            let bitmapSize = graph.getGraphAreaOnlySize();
            if (!graphBitmapRGB || 
                    graphBitmapRGB.width !== bitmapSize.width || 
                    graphBitmapRGB.height !== bitmapSize.height){
                if (graphBitmapRGB){
                    graphBitmapRGB.clear();
                }
                graphBitmapRGB = new Bitmap(bitmapSize.width, bitmapSize.height);
            }
            for (let c = 0; c < dataSamplePairs.length; c++){
                if (selectedChannel === 3 || selectedChannel === c){
                    let graphAreaOnly = graph.graphAreaOnlyFactory(graphBitmapRGB);
                    drawLineAndPoints(graphAreaOnly, isHorizontal, lineColors[c], dataSamplePairs[c], pointColors[c]);
                    graph.mergeWithGraphAreaOnly(graphAreaOnly);
                }
            }
        }
        return graph;
    }
    
    construct();
}