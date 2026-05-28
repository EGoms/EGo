
//"use strict";

/**
 * y = mx + b
 * @param {Number} m
 * @param {Number} b
 * @returns {LinearFitData}
 */
function LinearFitData(m, b) {
    this.m = m;
    this.b = b;
}

/**
 * This object calculates Least Square Fit
 * y = mx + b
 * m = (N * Sum(xy) - Sum(x) * Sum(y)) /
 *     (N * Sum(x^2) - (Sum(x))^2)
 * b = (Sum(y) - m * Sum(x)) / N
 */
function LeastSquareFitAlgorithm() {
    // y = reference, x = target
    let sumX_ = 0.0;
    let sumY_ = 0.0;
    let sumSquaredX_ = 0.0;
    let sumXY_ = 0.0;
    let n_ = 0;

    /**
     * @param {Number} x
     * @param {Number} y
     */
    this.addValue = function (x, y) {
        sumX_ += x;
        sumY_ += y;
        sumSquaredX_ += x * x;
        sumXY_ += x * y;
        n_++;
    };

    /**
     * Calculate line from data points
     * @return {LinearFitData} Fitted line (y = mx + b)
     */
    this.getLinearFit = function () {
        if (n_ > 1) {
            let m = ((n_ * sumXY_) - (sumX_ * sumY_)) /
                    ((n_ * sumSquaredX_) - (sumX_ * sumX_));

            let b = (sumY_ - (m * sumX_)) / n_;
            return new LinearFitData(m, b);
        } else if (n_ === 1){
            console.warningln("WARNING: Least Squares Fit only has one point. Assuming origin as second point.");
            return new LinearFitData(sumY_ / sumX_, 0);
        } else {
            console.warningln("WARNING: Least Squares Fit has no points to fit. " +
                    "Defaulting to gradient = 1, y intercept = 0");
            return new LinearFitData(1, 0);
        }
    };
    
    /**
     * Calculates the best fit line that goes through the origin.
     * This is particularly helpful for photometry graphs with only a few points
     * These lines should always go through the origin.
     * @returns {LinearFitData}
     */
    this.getOriginFit = function () {
        if (n_ > 0) {
            let m = sumXY_ / sumSquaredX_;
            return new LinearFitData(m, 0);
        } else {
            console.warningln("WARNING: Least Squares Fit has no points to fit. " +
                    "Defaulting to gradient = 1, y intercept = 0");
            return new LinearFitData(1, 0);
        }
    };
}

/**
 * Estimate gradient from the mean and median of non zero samples within the overlap
 * @param {View} refView
 * @param {View} tgtView
 * @param {Number} refLimit 
 * @param {Number} tgtLimit 
 * @param {Overlap} overlap
 * @param {Number} channel
 * @returns {LinearFitData}
 */
function estimateGradient(refView, tgtView, refLimit, tgtLimit, overlap, channel){
    /**
     * @param {Image} image
     * @param {Rect} rect
     * @param {Number} channel
     * @returns {Float32Array|Float64Array} Samples read from the supplied image
     */
    function getSamples(image, rect, channel){
        let samples = image.bitsPerSample === 64 ? new Float64Array(rect.area) : new Float32Array(rect.area);
        image.getSamples(samples, rect, channel);
        return samples;
    }
    
    let refSamples = getSamples(refView.image, overlap.overlapBox, channel);
    let tgtSamples = getSamples(tgtView.image, overlap.overlapBox, channel);
    let overlapMaskBuffer = overlap.getOverlapMaskBuffer();
    let tgtArray = [];
    let refArray = [];
    let length = overlapMaskBuffer.length;
    for (let i=0; i<length; i++){
        if (overlapMaskBuffer[i]){
            let ref = refSamples[i];
            let tgt = tgtSamples[i];
            if ((ref < refLimit) && (tgt < tgtLimit)){
                refArray.push(ref);
                tgtArray.push(tgt);
            }
        }
    }
    let refMedian = Math.median(refArray);
    let refMean = Math.mean(refArray);
    let tgtMedian = Math.median(tgtArray);
    let tgtMean = Math.mean(tgtArray);
    let refDif = refMean - refMedian;
    let tgtDif = tgtMean - tgtMedian;
    let m = (refDif > 0) && (tgtDif > 0) ? refDif / tgtDif : 1;
    let b = eqnOfLineCalcYIntercept(tgtMedian, refMedian, m);
    return new LinearFitData(m, b);
}

/**
 * y = mx + b
 * @param {Number} x coordinate
 * @param {Number} m gradient
 * @param {Number} b y-axis intercept
 * @returns {Number} y coordinate
 */
function eqnOfLineCalcY(x, m, b) {
    return m * x + b;
}
/**
 * m = (y1 - y0) / (x1 - x0)
 * @param {Number} x0 point0 x-coordinate
 * @param {Number} y0 point0 y-coordinate
 * @param {Number} x1 point1 x-coordinate
 * @param {Number} y1 point1 y-coordinate
 * @returns {Number} Gradient
 */
function eqnOfLineCalcGradient(x0, y0, x1, y1) {
    return (y1 - y0) / (x1 - x0);
}   
/**
 * y = mx + b
 * Hence
 * b = y - mx
 * @param {Number} x0 x-coordinate
 * @param {Number} y0 y-coordinate
 * @param {Number} m Gradient
 * @returns {Number} Y Intercept (b)
 */
function eqnOfLineCalcYIntercept(x0, y0, m) {
    return y0 - m * x0;
}
