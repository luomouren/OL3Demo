goog.provide('MilStd.ModifyTool');

goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.events');
goog.require('goog.functions');
goog.require('ol.Collection');
goog.require('ol.CollectionEventType');
goog.require('ol.Feature');
//goog.require('ol.FeatureOverlay');
goog.require("ol.layer.Vector");
goog.require("ol.source.Vector");
goog.require('ol.MapBrowserEvent.EventType');
goog.require('ol.ViewHint');
goog.require('ol.coordinate');
goog.require('ol.events.condition');
goog.require('ol.extent');
goog.require('ol.geom.GeometryType');
goog.require('ol.geom.LineString');
goog.require('ol.geom.MultiLineString');
goog.require('ol.geom.MultiPoint');
goog.require('ol.geom.MultiPolygon');
goog.require('ol.geom.Point');
goog.require('ol.geom.Polygon');
goog.require('ol.interaction.Pointer');
goog.require('ol.structs.RBush');
goog.require('ol.style.Style');
goog.require("MilStd.event.MilStdDrawEvent");

/**
* @typedef {{depth: (Array.<number>|undefined),
*            feature: ol.Feature,
*            //geometry: ol.geom.SimpleGeometry,
*            index: (number|undefined),
*            segment: Array.<ol.Extent>}}
*/
ol.interaction.SegmentDataType;

/**
* @classdesc
* Interaction for modifying vector data.
*
* @constructor
* @extends {ol.interaction.Pointer}
* @param {olx.interaction.ModifyOptions} options Options.
* @api stable
*/
MilStd.ModifyTool = function (map, opt_options) {
    var options = goog.isDef(opt_options) ? opt_options : {};
    goog.base(this, {
        handleDownEvent: MilStd.ModifyTool.handleDownEvent_,
        handleDragEvent: MilStd.ModifyTool.handleDragEvent_,
        handleEvent: MilStd.ModifyTool.handleEvent,
        handleUpEvent: MilStd.ModifyTool.handleUpEvent_,
        handleMoveEvent: MilStd.ModifyTool.handleMoveEvent
    });

    this.map_ = map;
    /**
    * Editing vertex.
    * @type {ol.Feature}
    * @private
    */
    this.vertexFeature_ = null;

    /**
    * @type {ol.Pixel}
    * @private
    */
    this.lastPixel_ = [0, 0];

    /**
    * Segment RTree for each layer
    * @type {Object.<*, ol.structs.RBush>}
    * @private
    */
    this.rBush_ = new ol.structs.RBush();

    /**
    * @type {number}
    * @private
    */
    this.pixelTolerance_ = goog.isDefAndNotNull(options.pixelTolerance) ?
      options.pixelTolerance : 10;

    /**
    * @type {boolean}
    * @private
    */
    this.snappedToVertex_ = false;

    /**
    * @type {Array}
    * @private
    */
    this.dragSegments_ = null;

    this.oldVerticesFeature = new ol.Collection();

    /**
    * Draw overlay where are sketch features are drawn.
    * @type {ol.FeatureOverlay}
    * @private
    */
//    this.overlay_ = new ol.FeatureOverlay({
//        style: goog.isDef(options.style) ? options.style :
//        MilStd.ModifyTool.getDefaultStyleFunction()
//    });

    this.overlay_ = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: goog.isDef(options.style) ? options.style :
        MilStd.ModifyTool.getDefaultStyleFunction()
    });

    /**
    * @const
    * @private
    * @type {Object.<string, function(ol.Feature, ol.geom.Geometry)> }
    */
    this.SEGMENT_WRITERS_ = {
        'Polygon': this.writeVerticeGeometry,
        'MultiLineString': this.writeVerticeGeometry,
        'LineString': this.writeVerticeGeometry
    };
    this.selectTool = null;
    /**
    * @type {ol.Collection.<ol.Feature>}
    * @private
    */
    this.features_ = goog.isDef(options.features) ? options.features : null;

    /**
    * @type {string|undefined}
    * @private
    */
    this.cursor_ = 'pointer';

    /**
    * @type {string|undefined}
    * @private
    */
    this.previousCursor_ = undefined;

};
goog.inherits(MilStd.ModifyTool, ol.interaction.Pointer);



MilStd.ModifyTool.prototype.activate = function () {
    if (this.selectTool == null) {
        this.selectTool = new ol.interaction.Select();
    }

    if (!goog.isDefAndNotNull(this.map_)) {
        return;
    }

    var interActionArr = this.map_.getInteractions();
    for (var i = 0, len = interActionArr.getLength(); i < len; i++) {
        var item = interActionArr.item(i);
        if (item instanceof ol.interaction.Select || item instanceof MilStd.ModifyTool) {
            interActionArr.remove(item);
        }
    }

    this.map_.addInteraction(this.selectTool);
    this.map_.addInteraction(this);

    this.map_.on("dblclick", this.modifyEndHandle, this);
    this.features_ = this.selectTool.getFeatures();
    this.features_.forEach(this.addFeature_, this);

    goog.events.listen(this.features_, ol.CollectionEventType.ADD,
      this.handleFeatureAdd_, false, this);
    goog.events.listen(this.features_, ol.CollectionEventType.REMOVE,
      this.handleFeatureRemove_, false, this);

    MilStd.tool.MilStdDrawTool.prototype.ShieldDBClickZoomEvent(this.map_);
   
};

MilStd.ModifyTool.prototype.deactivate = function () {
    if (goog.isDefAndNotNull(this.map_)) {
        MilStd.tool.MilStdDrawTool.prototype.UnShieldDBClickZoomEvent(this.map_);
        this.map_.removeInteraction(this.selectTool);
        this.map_.removeInteraction(this);
    }
};

MilStd.ModifyTool.prototype.disconnectEventHandlers = function () {
    if (goog.isDefAndNotNull(this.map_)) {
        this.map_.un("dblclick", this.modifyEndHandle, this);
        this.map_.removeInteraction(this.selectTool);
        this.map_.removeInteraction(this);
    }
    goog.events.unlisten(this.features_, ol.CollectionEventType.ADD,
      this.handleFeatureAdd_, false, this);
    goog.events.unlisten(this.features_, ol.CollectionEventType.REMOVE,
      this.handleFeatureRemove_, false, this);
};

MilStd.ModifyTool.prototype.modifyEndHandle = function (e) {
    this.disconnectEventHandlers();
    if (goog.isDefAndNotNull(this.oldVerticesFeature)) {
        this.clearOverLayer(this.overlay_);
        this.oldVerticesFeature.clear();
    }
};

/**
* @param {ol.Feature} feature Feature.
* @private
*/
MilStd.ModifyTool.prototype.addFeature_ = function (feature) {

    var geometry = feature.getGeometry();
    if (geometry instanceof ol.geom.Point) {
        geom = geometry;
    }
    if (geometry instanceof ol.geom.GeometryCollection) {
        geom = geometry.geometries_[0];
    }
    else {
        geom = geometry;
    }
    if (goog.isDef(this.SEGMENT_WRITERS_[geom.getType()])) {
        this.SEGMENT_WRITERS_[geom.getType()].call(this, feature);
        this.oldVerticesFeature.clear();
        this.clearOverLayer(this.overlay_);
        if (goog.isDefAndNotNull(geometry.vertices)) {
            for (var i = 0; i < geometry.vertices.length; i++) {
                var vertexFeature = new ol.Feature(new ol.geom.Point(geometry.vertices[i]));
//                this.overlay_.addFeature(vertexFeature);
                this.overlay_.getSource().addFeature(vertexFeature);
                this.oldVerticesFeature.push(vertexFeature);
            }
        }
    }
    var map = this.getMap();
    if (!goog.isNull(map)) {
        this.handlePointerAtPixel(this.lastPixel_, map);
    }
};

MilStd.ModifyTool.prototype.clearOverLayer = function (overlayer) {
    if (goog.isDefAndNotNull(overlayer)) {
//        var features = overlayer.getFeatures();
//        var len = features.getLength();
        var features = overlayer.getSource().getFeatures();
        var len = features.length;
        for (var i = len-1; i >= 0; i--) {
//            overlayer.removeFeature(features.item(i));
            overlayer.getSource().removeFeature(features[i]);
        }
    };
};
/**
* @inheritDoc
*/
MilStd.ModifyTool.prototype.setMap = function (map) {
    this.overlay_.setMap(map);
    goog.base(this, 'setMap', map);
};


/**
* @param {ol.CollectionEvent} evt Event.
* @private
*/
MilStd.ModifyTool.prototype.handleFeatureAdd_ = function (evt) {
    var feature = evt.element;
    goog.asserts.assertInstanceof(feature, ol.Feature);
    this.addFeature_(feature);
};


/**
* @param {ol.CollectionEvent} evt Event.
* @private
*/
MilStd.ModifyTool.prototype.handleFeatureRemove_ = function (evt) {
    var feature = evt.element;
    if (goog.isDefAndNotNull(feature)) {
        this.dispatchEvent(new MilStd.event.MilStdDrawEvent(MilStd.event.MilStdDrawEvent.MODIFY_FEATURE_END, feature));
    }

    var rBush = this.rBush_;
    var i, nodesToRemove = [];
    rBush.forEachInExtent(feature.getGeometry().getExtent(), function (node) {
        if (feature === node.feature) {
            nodesToRemove.push(node);
        }
    });
    for (i = nodesToRemove.length - 1; i >= 0; --i) {
        rBush.remove(nodesToRemove[i]);
    }

    this.clearOverLayer(this.overlay_);
    this.oldVerticesFeature.clear();
    this.vertexFeature_ = null;
};

/**
* @把军标几何的控制点信息加入到rBush中，以调高检索能力
* @param {ol.Feature} feature Feature
* @param {MilStd.SimpleArrow} geometry Geometry.
* @private
*/
MilStd.ModifyTool.prototype.writeVerticeGeometry = function (feature) {
    var points = feature.getGeometry().vertices;
    var coordinates, i, ii, segmentData;
    for (i = 0, ii = points.length; i < ii; ++i) {
        coordinates = points[i];
        segmentData ={
            feature: feature,
            depth: [i],
            index: i,
            segment: [coordinates, coordinates]
        }; /** @type {ol.interaction.SegmentDataType} */
        this.rBush_.insert(ol.extent.boundingExtent(segmentData.segment), segmentData);
    }
};

/**
* @ 创建或更新控制点要素，
* @param {ol.Coordinate} coordinates Coordinates.
* @return {ol.Feature} Vertex feature.
* @private
*/
MilStd.ModifyTool.prototype.createOrUpdateVertexFeature_ = function (coordinates) {
    var vertexFeature = this.vertexFeature_;
    if (goog.isNull(vertexFeature)) {
        vertexFeature = new ol.Feature(new ol.geom.Point(coordinates));
        this.vertexFeature_ = vertexFeature;
        //        this.overlay_.addFeature(vertexFeature);
        this.overlay_.getSource().addFeature(vertexFeature);
    } else {
        var geometry = vertexFeature.getGeometry(); /** @type {ol.geom.Point} */
        geometry.setCoordinates(coordinates);
        vertexFeature.setGeometry(geometry);
    }

    return vertexFeature;
};

/**
* @更新当前控制点，以实现拖拽过程中对当前控制点要素的控制
* @param {Number} verticeIndex（控制点索引）.
* @param {ol.coordinate} coordinate（新的控制点坐标）.
* @this {MilStd.ModifyTool}
* @private
*/
MilStd.ModifyTool.prototype.redrawVertices = function (verticeIndex, coordinate) {
    if (goog.isDefAndNotNull(this.oldVerticesFeature)) {      
        var feature = this.oldVerticesFeature.item(verticeIndex);
        feature.setGeometry(new ol.geom.Point(coordinate));
        this.oldVerticesFeature.setAt(verticeIndex, feature);
    }
};

/**
* @param {ol.MapBrowserPointerEvent} evt Event.
* @return {boolean} Start drag sequence?
* @this {MilStd.ModifyTool}
* @private
*/
MilStd.ModifyTool.handleDownEvent_ = function (evt) {
    this.handlePointerAtPixel(evt.pixel, evt.map);
    this.dragSegments_ = [];
    var vertexFeature = this.vertexFeature_;
    if (!goog.isNull(vertexFeature)) {
        var geometry = vertexFeature.getGeometry(); /** @type {ol.geom.Point} */
        var vertex = geometry.getCoordinates();
        var vertexExtent = ol.extent.boundingExtent([vertex]);
        var segmentDataMatches = this.rBush_.getInExtent(vertexExtent);
        for (var i = 0, ii = segmentDataMatches.length; i < ii; ++i) {
            var segmentDataMatch = segmentDataMatches[i];
            var segment = segmentDataMatch.segment;

            if (ol.coordinate.equals(segment[0], vertex)) {
                this.dragSegments_.push([segmentDataMatch, 0]);
            }
            else if (ol.coordinate.equals(segment[1], vertex)) {
                this.dragSegments_.push([segmentDataMatch, 1]);
            }
        }
    }
    return !goog.isNull(this.vertexFeature_);
};


MilStd.ModifyTool.handleMoveEvent = function (evt) {
    if (this.cursor_) {
        var map = evt.map;
        var feature = map.forEachFeatureAtPixel(evt.pixel,
        function (feature, layer) {
            return feature;
        });
        var element = evt.map.getTargetElement();
        if (feature) {
            if (element.style.cursor != this.cursor_) {
                this.previousCursor_ = element.style.cursor;
                element.style.cursor = this.cursor_;
            }
        } else if (this.previousCursor_ !== undefined) {
            element.style.cursor = this.previousCursor_;
            this.previousCursor_ = undefined;
        }
    }
};

/**
* @param {ol.MapBrowserPointerEvent} evt Event.
* @this {MilStd.ModifyTool}
* @private
*/
MilStd.ModifyTool.handleDragEvent_ = function (evt) {
    var vertex = evt.coordinate;
    for (var i = 0, ii = this.dragSegments_.length; i < ii; ++i) {
        var dragSegment = this.dragSegments_[i];

        var segmentData = dragSegment[0];
        var index = dragSegment[1];

        var verticeIndex = segmentData.index;
        var feature = segmentData.feature;
        var geom = feature.getGeometry();

        if (geom.getType() == ol.geom.GeometryType.GEOMETRY_COLLECTION) {
            while (vertex.length < feature.getGeometry().geometries_[0].getStride()) {
                vertex.push(0);
            }
            var vertices = geom.vertices;
            if (geom.milStdType == MilStd.EnumMilstdType.TriangleFlag || geom.milStdType == MilStd.EnumMilstdType.RectFlag ||
            geom.milStdType == MilStd.EnumMilstdType.CurveFlag || geom.milStdType == MilStd.EnumMilstdType.ArrowCross ||
            geom.milStdType == MilStd.EnumMilstdType.CircleClosedangle || geom.milStdType == MilStd.EnumMilstdType.Closedangle ||
            geom.milStdType == MilStd.EnumMilstdType.DoubleClosedangle || geom.milStdType == MilStd.EnumMilstdType.Fourstar ||
            geom.milStdType == MilStd.EnumMilstdType.Rhombus || geom.milStdType == MilStd.EnumMilstdType.SameDirectionClosedangle ||
            geom.milStdType == MilStd.EnumMilstdType.Triangle || geom.milStdType == MilStd.EnumMilstdType.Vane) {

                if (verticeIndex == 0) {
                    if ((vertex[0] - vertices[1][0]) >= 0 || (vertex[1] - vertices[1][1]) <= 0) {
                        return;
                    }
                }
                else if (verticeIndex == 1) {
                    if ((vertex[0] - vertices[0][0]) <= 0 || (vertex[1] - vertices[0][1]) >= 0) {
                        return;
                    }
                }
            }

            this.updateFeature(segmentData, vertex, true);
            break;
        }
        this.createOrUpdateVertexFeature_(vertex);
    }
};

/**
* @param {ol.MapBrowserPointerEvent} evt Event.
* @return {boolean} Stop drag sequence?
* @this {MilStd.ModifyTool}
* @private
*/
MilStd.ModifyTool.handleUpEvent_ = function (evt) {
    var vertex = evt.coordinate;
    var segmentData;
    for (var i = this.dragSegments_.length - 1; i >= 0; --i) {
        segmentData = this.dragSegments_[i][0];
        this.rBush_.update(ol.extent.boundingExtent(segmentData.segment),segmentData);
        var geom = segmentData.feature.getGeometry();
        var vertices = geom.vertices;
        if (geom.milStdType == MilStd.EnumMilstdType.TriangleFlag || geom.milStdType == MilStd.EnumMilstdType.RectFlag ||
            geom.milStdType == MilStd.EnumMilstdType.CurveFlag || geom.milStdType == MilStd.EnumMilstdType.ArrowCross ||
            geom.milStdType == MilStd.EnumMilstdType.CircleClosedangle || geom.milStdType == MilStd.EnumMilstdType.Closedangle ||
            geom.milStdType == MilStd.EnumMilstdType.DoubleClosedangle || geom.milStdType == MilStd.EnumMilstdType.Fourstar ||
            geom.milStdType == MilStd.EnumMilstdType.Rhombus || geom.milStdType == MilStd.EnumMilstdType.SameDirectionClosedangle ||
            geom.milStdType == MilStd.EnumMilstdType.Triangle || geom.milStdType == MilStd.EnumMilstdType.Vane) {

            if (segmentData.index == 0) {
                if ((vertex[0] - vertices[1][0]) >= 0 || (vertex[1] - vertices[1][1]) <= 0) {
                    return false;
                }
            }
            else if (segmentData.index == 1) {
                if ((vertex[0] - vertices[0][0]) <= 0 || (vertex[1] - vertices[0][1]) >= 0) {
                    return false;
                }
            }
        }
        this.updateFeature(segmentData, evt.coordinate, true);
    }
    return false;
};

MilStd.ModifyTool.prototype.updateFeature = function (segmentData, coordinate, isDraging) {
    var geom = segmentData.feature.getGeometry();
    var vertices = geom.vertices;
    vertices[segmentData.index] = coordinate;

    geom.Update(vertices, isDraging);

    segmentData.feature.setGeometry(geom);
    if (this.vertexFeature_ != null) {
        var pntGeom = this.vertexFeature_.getGeometry();
        pntGeom.setCoordinates(coordinate);
        this.vertexFeature_.setGeometry(pntGeom);
    }

    this.redrawVertices(segmentData.index, coordinate);
    this.rBush_.remove(segmentData);
    var segment = segmentData.segment;
    segment[0] = segment[1] = coordinate;
    segmentData.segment = segment;
    this.rBush_.insert(ol.extent.boundingExtent(segmentData.segment), segmentData);

};

/**
* @param {ol.MapBrowserEvent} mapBrowserEvent Map browser event.
* @return {boolean} `false` to stop event propagation.
* @this {MilStd.ModifyTool}
* @api
*/
MilStd.ModifyTool.handleEvent = function (mapBrowserEvent) {
    var handled;
    if (!mapBrowserEvent.map.getView().getHints()[ol.ViewHint.INTERACTING] &&
    mapBrowserEvent.type == ol.MapBrowserEvent.EventType.POINTERMOVE) {
        this.handlePointerMove_(mapBrowserEvent);
    }
    return ol.interaction.Pointer.handleEvent.call(this, mapBrowserEvent) &&
    !handled;
};


/**
* @param {ol.MapBrowserEvent} evt Event.
* @private
*/
MilStd.ModifyTool.prototype.handlePointerMove_ = function (evt) {
    this.lastPixel_ = evt.pixel;
    this.handlePointerAtPixel(evt.pixel, evt.map);
};

/**
* @param {ol.Pixel} pixel Pixel
* @param {ol.Map} map Map.
* @private
*/
MilStd.ModifyTool.prototype.handlePointerAtPixel = function (pixel, map) {
    var pixelCoordinate = map.getCoordinateFromPixel(pixel);

    //像素点到控制点距离升序排列函数
    var sortByDistance = function (a, b) {
        return ol.coordinate.squaredDistanceToSegment(pixelCoordinate, a.segment) -
               ol.coordinate.squaredDistanceToSegment(pixelCoordinate, b.segment);
    };

    //构建点查询的范围（ol.extent）
    var lowerLeft = map.getCoordinateFromPixel(
        [pixel[0] - this.pixelTolerance_, pixel[1] + this.pixelTolerance_]);
    var upperRight = map.getCoordinateFromPixel(
        [pixel[0] + this.pixelTolerance_, pixel[1] - this.pixelTolerance_]);
    var box = ol.extent.boundingExtent([lowerLeft, upperRight]);

    var rBush = this.rBush_;
    var nodes = rBush.getInExtent(box);
    if (nodes.length > 0) {
        nodes.sort(sortByDistance);
        var node = nodes[0];
        var closestSegment = node.segment;
        var pixel1 = map.getPixelFromCoordinate(closestSegment[0]);
        var pixel2 = map.getPixelFromCoordinate(closestSegment[1]);
        var squaredDist1 = ol.coordinate.squaredDistance(pixel, pixel1);
        var squaredDist2 = ol.coordinate.squaredDistance(pixel, pixel2);
        var dist = Math.sqrt(Math.min(squaredDist1, squaredDist2));
        this.snappedToVertex_ = dist <= this.pixelTolerance_;
        if (this.snappedToVertex_) {
            this.createOrUpdateVertexFeature_(closestSegment[0]);
        }
        return;
    }
    if (!goog.isNull(this.vertexFeature_)) {
//        this.overlay_.removeFeature(this.vertexFeature_);
        this.overlay_.getSource().removeFeature(this.vertexFeature_);
        this.vertexFeature_ = null;
    }

};

/**
* @return {ol.style.StyleFunction} Styles.
*/
MilStd.ModifyTool.getDefaultStyleFunction = function () {
    var style = ol.style.createDefaultEditingStyles();
    return function (feature, resolution) {
        return style[ol.geom.GeometryType.POINT];
    };
};



goog.provide('MilStd.DragPan');
goog.require("MilStd.event.MilStdDrawEvent");
goog.require('ol.interaction.Pointer');
/**
* @constructor
* @extends {ol.interaction.Pointer}
*/
MilStd.DragPan = function (map) {

    ol.interaction.Pointer.call(this, {
        handleDownEvent: MilStd.DragPan.prototype.handleDownEvent,
        handleDragEvent: MilStd.DragPan.prototype.handleDragEvent,
        handleMoveEvent: MilStd.DragPan.prototype.handleMoveEvent,
        handleUpEvent: MilStd.DragPan.prototype.handleUpEvent
    });

    this.map_ = goog.isDefAndNotNull(map) ? map : null;
    /**
    * @type {ol.Pixel}
    * @private
    */
    this.coordinate_ = null;

    /**
    * @type {ol.Feature}
    * @private
    */
    this.feature_ = null;

    /**
    * @type {string|undefined}
    * @private
    */
   // this.cursor_ = 'pointer';
    this.cursor_ = 'move';
    
    /**
    * @type {string|undefined}
    * @private
    */
    this.previousCursor_ = undefined;

};
ol.inherits(MilStd.DragPan, ol.interaction.Pointer);

MilStd.DragPan.prototype.activate = function () {
    if (!goog.isDefAndNotNull(this.map_)) {
        return;
    }
    var interActionArr = this.map_.getInteractions();
    for (var i = 0, len = interActionArr.getLength(); i < len; i++) {
        var item = interActionArr.item(i);
        if (item instanceof MilStd.DragPan) {
            interActionArr.remove(item);
        }
    }
    this.map_.addInteraction(this);
    MilStd.tool.MilStdDrawTool.prototype.ShieldDBClickZoomEvent(this.map_);
    this.map_.on("dblclick", this.modifyEndHandle, this);
};

MilStd.DragPan.prototype.deactivate = function () {
    if (!goog.isDefAndNotNull(this.map_)) {
        return;
    }
    MilStd.tool.MilStdDrawTool.prototype.UnShieldDBClickZoomEvent(this.map_);
    this.map_.removeInteraction(this);
};

MilStd.DragPan.prototype.modifyEndHandle = function (e) {
    if (!goog.isDefAndNotNull(this.map_)) {
        return;
    }
    this.map_.un("dblclick", this.modifyEndHandle, this);
    this.setActive(false);
}

/**
* @param {ol.MapBrowserEvent} evt Map browser event.
* @return {boolean} `true` to start the drag sequence.
*/
MilStd.DragPan.prototype.handleDownEvent = function (evt) {
    var map = evt.map;

    var feature = map.forEachFeatureAtPixel(evt.pixel,
      function (feature, layer) {
          return feature;
      });

    if (feature) {
        this.coordinate_ = evt.coordinate;
        this.feature_ = feature;
    }

    return !!feature;
};


/**
* @param {ol.MapBrowserEvent} evt Map browser event.
*/
MilStd.DragPan.prototype.handleDragEvent = function (evt) {
    var map = evt.map;

    var feature = map.forEachFeatureAtPixel(evt.pixel,
      function (feature, layer) {
          return feature;
      });

    var deltaX = evt.coordinate[0] - this.coordinate_[0];
    var deltaY = evt.coordinate[1] - this.coordinate_[1];

    var geometry = /** @type {ol.geom.SimpleGeometry} */
      (this.feature_.getGeometry());
    geometry.translate(deltaX, deltaY);

    if (goog.isDefAndNotNull(geometry.vertices)) {
        var vertices = geometry.vertices;
        for (var i = 0, len = vertices.length; i < len; i++) {
            ol.coordinate.sub(vertices[i], [-deltaX, -deltaY]);
        }
    }

    this.coordinate_[0] = evt.coordinate[0];
    this.coordinate_[1] = evt.coordinate[1];
};


/**
* @param {ol.MapBrowserEvent} evt Event.
*/
MilStd.DragPan.prototype.handleMoveEvent = function (evt) {
    if (this.cursor_) {
        var map = evt.map;
        var feature = map.forEachFeatureAtPixel(evt.pixel,
        function (feature, layer) {
            return feature;
        });
        var element = evt.map.getTargetElement();
        if (feature) {
            if (element.style.cursor != this.cursor_) {
                this.previousCursor_ = element.style.cursor;
                element.style.cursor = this.cursor_;
            }
        } else if (this.previousCursor_ !== undefined) {
            element.style.cursor = this.previousCursor_;
            this.previousCursor_ = undefined;
        }
    }
};


/**
* @param {ol.MapBrowserEvent} evt Map browser event.
* @return {boolean} `false` to stop the drag sequence.
*/
MilStd.DragPan.prototype.handleUpEvent = function (evt) {
    var element = evt.map.getTargetElement();
    element.style.cursor = "default";
    if (goog.isDefAndNotNull(this.feature_)) {
        this.dispatchEvent(new MilStd.event.MilStdDrawEvent(MilStd.event.MilStdDrawEvent.MODIFY_FEATURE_END, this.feature_));
    }
    this.coordinate_ = null;
    this.feature_ = null;
    return false;
};




