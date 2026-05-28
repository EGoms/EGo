/* global EXTRA_CONTROLS, View, LINEAR_RANGE */

//"use strict";

function MosaicCache() {
    let refViewId;
    let tgtViewId;
    let isColorFlag;
    /** Star detection sensitivity */
    let logRefSensitivity;
    let logTgtSensitivity;
    /** Linear range: Auto default assumes 70% of image's maximum value */
    let linearRangeRef = LINEAR_RANGE;
    let linearRangeTgt = LINEAR_RANGE;
    /** Stores refBox, tgtBox, overlapBox, overlapMask, hasOverlap ... */
    this.overlap = null;
    /** Ref and tgt detected 'raw' stars. Fluxes determined with calculated defaults (ignores user settings).
     * Stars with negative fluxes are excluded. */
    let detectedRefStars;
    let detectedTgtStars;
    /** {Star[]} All 'raw' stars detected in all tgt and ref channels, duplicates removed, sorted by star flux */
    let allStars = null;
    let nStarsInsideOverlap;
    let maxStarFlux;
    /** cache of sample rectangles that don't contain any black pixels. */
    let sampleGridCache = new Map();
    /** cache of target star search rectangles */
    let starQuadTreeCache = new Map();
    /** cache of StarMatch[] */
    let starMatchCache = new Map();
    
    let self = this;
    
    /**
     * Stores the reference and target view id, and the star detection sensitivity.
     * If ref or tgt images have changed, all cached items are cleared.
     * If the star detection sensitivity has changed, all star related items are cleared.
     * @param {String} refId
     * @param {String} tgtId
     * @param {Number} refSensitivity log star detection sensitivity
     * @param {Number} tgtSensitivity log star detection sensitivity
     */
    this.setUserInputData = function (refId, tgtId, refSensitivity, tgtSensitivity) {
        if (refId !== refViewId || tgtId !== tgtViewId){
            // reset everything
            this.invalidate();
            
            let refView = viewByIdSafe( refId );
            if (refView.isNull){
                linearRangeRef = LINEAR_RANGE;
                isColorFlag = false;
            } else if (refId !== refViewId) {
                isColorFlag = refView.image.isColor;
                linearRangeRef = Math.round(1000 * refView.image.maximum() * LINEAR_RANGE) / 1000;
            }
            let tgtView = viewByIdSafe( tgtId );
            if (tgtView.isNull){
                linearRangeTgt = LINEAR_RANGE;
                isColorFlag = false;
            } else if (tgtId !== tgtViewId){
                isColorFlag = tgtView.image.isColor;
                linearRangeTgt = Math.round(1000 * tgtView.image.maximum() * LINEAR_RANGE) / 1000;
            }
            
            // Save the new values
            refViewId = refId;
            tgtViewId = tgtId;
            logRefSensitivity = refSensitivity;
            logTgtSensitivity = tgtSensitivity;
            return;
        }
        
        this.updateStarDetection(refSensitivity, tgtSensitivity);
    };
    
    this.updateStarDetection = function(refSensitivity, tgtSensitivity){
        if (logRefSensitivity !== refSensitivity || logTgtSensitivity !== tgtSensitivity){
            logRefSensitivity = refSensitivity;
            logTgtSensitivity = tgtSensitivity;
            // Only star detection has changed
            if (detectedRefStars){
                // This clears the detected ref stars
                detectedRefStars.setLogSensitivity(logRefSensitivity);
            }
            if (detectedTgtStars){
                // This clears the detected tgt stars
                detectedTgtStars.setLogSensitivity(logTgtSensitivity);
            }
            invalidateStarPairData();
        }
    };
    
    /**
     * @returns {Number}
     */
    this.getLinearRangeRef = function(){
        return linearRangeRef;
    };
    
    /**
     * @returns {Number}
     */
    this.getLinearRangeTgt = function(){
        return linearRangeTgt;
    };
    
    /**
     * @returns {Boolean} True if the reference image is color
     */
    this.isColor = function(){
        return isColorFlag;
    };
    
    /**
     * @param {Number} starSearchRadius
     * @param {Number} linearRangeTgt 
     * @returns {BRQuadTree}
     */
    function getStarQuadTree(starSearchRadius, linearRangeTgt){
        let key = "_" + starSearchRadius + "_" + linearRangeTgt; 
        let value = starQuadTreeCache.get(key);
        if (value === undefined){
            let tgtStars = self.getDetectedTgtStars().getStars();
            value = createQuadTree(tgtStars, starSearchRadius, linearRangeTgt, self.overlap.overlapBox);
            starQuadTreeCache.set(key, value);
        }
        return value;
    };
    
    /**
     * @param {Number} starSearchRadius
     * @param {Number} fluxTolerance
     * @param {Number} linearRangeRef
     * @param {Number} linearRangeTgt
     * @returns {StarMatch[]}
     */
    this.getStarMatchArray = function (starSearchRadius, fluxTolerance, linearRangeRef, linearRangeTgt){
        let key = "_" + starSearchRadius + "_" + fluxTolerance + "_" + linearRangeRef + "_" + linearRangeTgt; 
        let value = starMatchCache.get(key);
        if (value === undefined){
            let quadTree = getStarQuadTree(starSearchRadius, linearRangeTgt);
            let refStars = this.getDetectedRefStars().getStars();
            value = calcStarMatchArray(quadTree, refStars, starSearchRadius, fluxTolerance, linearRangeRef);
            starMatchCache.set(key, value);
        }
        return value;
    };
    
    /**
     * Creates and caches the sample rectangles that don't contain any black pixels in any channel.
     * Samples within rejection circles are still stored because the rejection circles can change.
     * @param {PhotometricMosaicData} data User settings
     * @returns {SampleGrid} Stores sample squares and can calculate samplePair[]
     */
    this.getSampleGrid = function (data){
        let key = "_" + data.sampleSize + "_";
        let value = sampleGridCache.get(key);
        if (value === undefined){
            let tgtImage = data.targetView.image;
            let refImage = data.referenceView.image;
            let overlapBox = this.overlap.overlapBox;
            let sampleSize = data.sampleSize;
            value = new SampleGrid(tgtImage, refImage, overlapBox, sampleSize);
            sampleGridCache.set(key, value);
        }
        return value;
    };
    
    /**
     * @param {Overlap} overlap
     */
    this.setOverlap = function(overlap){
        this.overlap = overlap;
    };
    
    /**
     * @returns {DetectedStars} Detected 'raw' reference stars.
     */
    this.getDetectedRefStars = function (){
        if (!detectedRefStars){
            let refView = viewByIdSafe( refViewId );
            detectedRefStars = new DetectedStars(refView, "Reference", this.overlap, logRefSensitivity);
        }
        return detectedRefStars;
    };
    
    /**
     * @returns {DetectedStars} Detected 'raw' target stars.
     */
    this.getDetectedTgtStars = function (){
        if (!detectedTgtStars){
            let tgtView = viewByIdSafe( tgtViewId );
            detectedTgtStars = new DetectedStars(tgtView, "Target   ", this.overlap, logTgtSensitivity);
        }
        return detectedTgtStars;
    };
    
    /**
     * @returns {Star[]} All detected 'raw' stars, duplicates removed, descending sort order.
     */
    this.getAllDetectedStars = function (){
        if (!allStars){
            allStars = combienStarArrays(this.getDetectedRefStars(), this.getDetectedTgtStars());
            nStarsInsideOverlap = 0;
            maxStarFlux = 0;
            for (let star of allStars){
                if (star.insideOverlap){
                    nStarsInsideOverlap++;
                }
                maxStarFlux = Math.max(maxStarFlux, star.getStarFlux());
            }
        }
        return allStars;
    };
    
    /**
     * @param {Boolean} calculate If true, count the stars. If false, return cached result or undefined.
     * @returns {Number|undefined} Number of stars within the overlap or undefined.
     */
    this.getStarCountInsideOverlap = function (calculate){
        if (calculate && !allStars){
            this.getAllDetectedStars();
        }
        return nStarsInsideOverlap;
    };
    
    /**
     * @param {Boolean} calculate If true, determine the brightest star. If false, return cached result or undefined.
     * @returns {Number|undefined} flux of the brightest star.
     */
    this.getMaxStarFlux = function (calculate){
        if (calculate && !allStars){
            this.getAllDetectedStars();
        }
        return maxStarFlux;
    };
    
    function invalidateStarPairData(){
        allStars = null;
        nStarsInsideOverlap = undefined;
        maxStarFlux = undefined;
        if (EXTRA_CONTROLS){
            for (let key of starQuadTreeCache.keys()) {
                console.writeln("Clearing starQuadTreeCache: ", key);
            }
            for (let key of starMatchCache.keys()) {
                console.writeln("Clearing starMatchCache: ", key);
            }
        }
        for (let quadTree of starQuadTreeCache.values()) {
            quadTree.clear();
        }
        starQuadTreeCache.clear();
        starMatchCache.clear();
    }
    
    /**
     * Clears all cached entries.
     */
    this.invalidate = function(){
        if (this.overlap){
            this.overlap.clear();
        }
        this.overlap = null;
        
        invalidateStarPairData();
        
        if (EXTRA_CONTROLS){
            for (let key of sampleGridCache.keys()) {
                console.writeln("Clearing sampleGridCache: ", key);
            }
        }
        sampleGridCache.clear();
        
        if (detectedRefStars){
            detectedRefStars.clear();
            detectedRefStars = null;
        }
        if (detectedTgtStars){
            detectedTgtStars.clear();
            detectedTgtStars = null;
        }
    };
}
