// FIXME cannot be shared between maps with different projections

goog.provide('ol.source.ImageWCS');

goog.require('goog.asserts');
goog.require('goog.events');
goog.require('goog.events.EventType');
goog.require('goog.object');
goog.require('goog.string');
goog.require('goog.uri.utils');
goog.require('ol');
goog.require('ol.Image');
goog.require('ol.ImageLoadFunctionType');
goog.require('ol.extent');
goog.require('ol.proj');
goog.require('ol.source.Image');

/**
 * @classdesc
 * Source for WCS servers providing single, untiled images.
 *
 * @constructor
 * @fires ol.source.ImageEvent
 * @extends {ol.source.Image}
 * @param {olx.source.ImageWCSOptions=} opt_options Options.
 * @api stable
 */
ol.source.ImageWCS = function(opt_options) {

  var options = goog.isDef(opt_options) ? opt_options : {};

  goog.base(this, {
    attributions: options.attributions, //数据源信息
    logo: options.logo,  //logo
    projection: options.projection,  //投影坐标系
    resolutions: options.resolutions  //分辨率数组
  });

  /**
   * @private
   * @type {?string}
   */
  this.crossOrigin_ =
      goog.isDef(options.crossOrigin) ? options.crossOrigin : null;

  /**
   * @private
   * @type {string|undefined}
   */
  this.url_ = options.url;

  /**
   * @private
   * @type {ol.ImageLoadFunctionType}
   */
  this.imageLoadFunction_ = goog.isDef(options.imageLoadFunction) ?
      options.imageLoadFunction : ol.source.Image.defaultImageLoadFunction;

  /**
   * @private
   * @type {Object}
   */
  this.params_ = options.params;

  
//  /**
//   * @private
//   * @type {ol.source.wcs.ServerType|undefined}
//   */
//  this.serverType_ =
//      /** @type {ol.source.wcs.ServerType|undefined} */ (options.serverType);

  /**
   * @private
   * @type {boolean}
   */
  this.hidpi_ = goog.isDef(options.hidpi) ? options.hidpi : true;

  /**
   * @private
   * @type {ol.Image}
   */
  this.image_ = null;

  /**
   * @private
   * @type {ol.Size}
   */
  this.imageSize_ = [0, 0];

  /**
   * @private
   * @type {number}
   */
  this.renderedRevision_ = 0;

  /**
   * @private
   * @type {number}
   */
  this.ratio_ = goog.isDef(options.ratio) ? options.ratio : 1.5;

};
goog.inherits(ol.source.ImageWCS, ol.source.Image);


/**
 * @const
 * @type {ol.Size}
 * @private
 */
ol.source.ImageWCS.GETFEATUREINFO_IMAGE_SIZE_ = [101, 101];

//var extent = ol.extent.getForViewAndSize(
//    coordinate, resolution, 0,
//    ol.source.ImageWCS.GETFEATUREINFO_IMAGE_SIZE_);

/**
 * Get the user-provided params, i.e. those passed to the constructor through
 * the "params" option, and possibly updated using the updateParams method.
 * @return {Object} Params.
 * @api stable
 */
ol.source.ImageWCS.prototype.getParams = function() {
  return this.params_;
};

/**
 * @inheritDoc
 */
ol.source.ImageWCS.prototype.getImage =
    function(extent, resolution, pixelRatio, projection) {

  if (!goog.isDef(this.url_)) {
    return null;
  }

  resolution = this.findNearestResolution(resolution);

  if (pixelRatio != 1 && (!this.hidpi_ || !goog.isDef(this.serverType_))) {
    pixelRatio = 1;
  }

  var image = this.image_;
  if (!goog.isNull(image) &&
      this.renderedRevision_ == this.getRevision() &&
      image.getResolution() == resolution &&
      image.getPixelRatio() == pixelRatio &&
      ol.extent.containsExtent(image.getExtent(), extent)) {
    return image;
  }
  //WCS服务请求url中固定参数
  var params = {
    'service': 'wcs',
    'version': '1.0.0',
    'request': 'getcoverage',
    'format': 'image/png'
  };
  goog.object.extend(params, this.params_);

  extent = extent.slice();
  var centerX = (extent[0] + extent[2]) / 2;
  var centerY = (extent[1] + extent[3]) / 2;
  if (this.ratio_ != 1) {
    var halfWidth = this.ratio_ * ol.extent.getWidth(extent) / 2;
    var halfHeight = this.ratio_ * ol.extent.getHeight(extent) / 2;
    extent[0] = centerX - halfWidth;
    extent[1] = centerY - halfHeight;
    extent[2] = centerX + halfWidth;
    extent[3] = centerY + halfHeight;
  }

  var imageResolution = resolution / pixelRatio;

  // Compute an integer width and height.
  var width = Math.ceil(ol.extent.getWidth(extent) / imageResolution);
  var height = Math.ceil(ol.extent.getHeight(extent) / imageResolution);

  // Modify the extent to match the integer width and height.
  extent[0] = centerX - imageResolution * width / 2;
  extent[2] = centerX + imageResolution * width / 2;
  extent[1] = centerY - imageResolution * height / 2;
  extent[3] = centerY + imageResolution * height / 2;

  this.imageSize_[0] = width;
  this.imageSize_[1] = height;

  var url = this.getRequestUrl_(extent, this.imageSize_, pixelRatio,
      projection, params);

  this.image_ = new ol.Image(extent, resolution, pixelRatio,
      this.getAttributions(), url, this.crossOrigin_, this.imageLoadFunction_);

  this.renderedRevision_ = this.getRevision();

  goog.events.listen(this.image_, goog.events.EventType.CHANGE,
      this.handleImageChange, false, this);

  return this.image_;

};


/**
 * Return the image load function of the source.
 * @return {ol.ImageLoadFunctionType} The image load function.
 * @api
 */
ol.source.ImageWCS.prototype.getImageLoadFunction = function() {
  return this.imageLoadFunction_;
};

/**
 * @param {ol.Extent} extent Extent.
 * @param {ol.Size} size Size.
 * @param {number} pixelRatio Pixel ratio.
 * @param {ol.proj.Projection} projection Projection.
 * @param {Object} params Params.
 * @return {string} Request URL.
 * @private
 */
ol.source.ImageWCS.prototype.getRequestUrl_ =
    function(extent, size, pixelRatio, projection, params) {
  goog.asserts.assert(goog.isDef(this.url_), 'url is defined');

  //params['CRS'] = projection.getCode(); //设置控件参考系
  //高宽参数
  params['width'] = size[0];
  params['height'] = size[1];
  //范围参数
  params['bbox'] = extent.join(',');
  return goog.uri.utils.appendParamsFromMap(this.url_, params);
};


/**
 * Return the URL used for this WCS source.
 * @return {string|undefined} URL.
 * @api stable
 */
ol.source.ImageWCS.prototype.getUrl = function() {
  return this.url_;
};


/**
 * Set the image load function of the source.
 * @param {ol.ImageLoadFunctionType} imageLoadFunction Image load function.
 * @api
 */
ol.source.ImageWCS.prototype.setImageLoadFunction = function(
    imageLoadFunction) {
  this.image_ = null;
  this.imageLoadFunction_ = imageLoadFunction;
  this.changed();
};


/**
 * Set the URL to use for requests.
 * @param {string|undefined} url URL.
 * @api stable
 */
ol.source.ImageWCS.prototype.setUrl = function(url) {
  if (url != this.url_) {
    this.url_ = url;
    this.image_ = null;
    this.changed();
  }
};


/**
 * Update the user-provided params.
 * @param {Object} params Params.
 * @api stable
 */
ol.source.ImageWCS.prototype.updateParams = function(params) {
  goog.object.extend(this.params_, params);
  this.image_ = null;
  this.changed();
};



