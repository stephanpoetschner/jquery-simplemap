"use strict";

(function ($) {
    // centers is a list of objects:
    // * { 'type': 'auto', 
    //     'zoom': '11' }
    //
    // * { 'type': 'static', 
    //     'zoom': '11', 
    //     'longitude': '16.372778',
    //     'latitude': '48.209206' }
    //
    // * { 'type': 'locate',
    //     'zoom': '12',
    //     'address': 'Vienna, Austria' }
    
    // triggers events:
    // * movend: center, northEast, southWest
    // * initialized: map
    
    if (!GBrowserIsCompatible()) {
        return;
    }
    var geocoder = new GClientGeocoder();
    $(document).unload(GUnload);
    
    var fuzzyInterpret = function (obj) {
        obj = obj || {};
        if (typeof(obj) === 'string') {
            return { 'type': 'locate', 'address': obj };
        }
        if ( $.isPlainObject(obj) && !obj.type ) {
            if (obj.longitude && obj.latitude) {
                obj.type = 'static';
            } else if ( obj.address) {
                obj.type = 'locate';
            } else {
                obj.type = 'auto';
            }
            return obj;
        }
    };

    $.fn.createMap = function (centers, settings) {

        var defaultSettings = { 'defaultZoom': 11,
                                'enableScroll': true,
                                'onlyNormalMapType': true };
        var settings = $.extend(defaultSettings, settings);

        centers = centers || [ { 'type': 'auto', } ];
        
        if (! $.isArray(centers) ) {
            centers = [ centers ];
        }
        
        $.each(centers, function (index, value) {
            centers[index] = fuzzyInterpret(value)
        });

        this.each(function () {
            var selectedElement = $(this);
            
            var addEvents = function (map, domElement) {
                $(domElement).trigger('initialized', [ map ]);
            
                GEvent.addListener(map, "moveend", function () {
                    var center = map.getCenter();
                    var bounds = map.getBounds();
                    var southWest = bounds.getSouthWest();
                    var northEast = bounds.getNorthEast();
                    
                    $(domElement).trigger('moveend', [center, northEast, southWest]);
                });
            };
            
            // *****
            // initializing controller elements
            // 'this' is the map element
            if (selectedElement.length !== 1) {
                throw 'Containing more than one element.';
            }
            var map = new GMap2(this);
            map.setUIToDefault();

            var customUI = map.getDefaultUI();
            if (!settings.enableScroll) {
                customUI.zoom.scrollwheel = false;
            }
            map.setUI(customUI);
            
            selectedElement.data('map', map);
            
            if (settings.onlyNormalMapType) {
                map.removeMapType(G_HYBRID_MAP);
                map.removeMapType(G_SATELLITE_MAP);
                map.removeMapType(G_PHYSICAL_MAP);
            }
            
            addEvents(map, this);
            
            var getCenterMapCallback = function (zoomlevel) {
                zoomlevel = zoomlevel || settings.defaultZoom;
                var centerMap = function (center) {
                    map.setCenter(center, parseInt(zoomlevel, 10));

                    var bounds = map.getBounds();
                    var southWest = bounds.getSouthWest();
                    var northEast = bounds.getNorthEast();
                    
                    $(selectedElement).trigger('moveend', [center, northEast, southWest]);
                };

                return centerMap;
            };

            // centering map
            $.each(centers, function (index, value) {
                var callback = getCenterMapCallback(value.zoom);
                if (value.type === 'static' &&
                   value.latitude !== '' && value.latitude !== '0' &&
                   value.longitude !== '' && value.longitude !== '0') {
                    var center = new GLatLng(value.latitude, value.longitude);
                    callback(center);
                    return false;
                } else if (value.type === 'auto') {
                    if (google.loader.ClientLocation) {
                        var clientLocation = google.loader.ClientLocation;
                        var center = new GLatLng(clientLocation.latitude, clientLocation.longitude);
                        callback(center);
                        return false;
                    }
                } else if (value.type === 'locate') {

                    var foundAddress = function (response) {
                        if (response && response.Status.code === 200) {
                            place = response.Placemark[0];
                            var center = new GLatLng(place.Point.coordinates[1], place.Point.coordinates[0]);
                            callback(center);
                        }
                    };
                
                    if (geocoder && value.address !== '') {
                        geocoder.getLocations(value.address, foundAddress);
                        return false;
                    }
                }
            });
        });
        return this;
    };

    
    
    $.fn.drawMarkers = function (userSettings, coloredMarkers) {
        var defaultSettings = {'addressSelector': '.address',
                                'latitudeSelector': '.latitude',
                                'longitudeSelector': '.longitude',
                                'defaultColor': 'blue',
                                'colors': {
                                    '.institute': 'red',
                                    '.teacher': 'blue'
                                }};

        var settings = $.extend(defaultSettings, userSettings);
        
        var defaultColoredMarkers = {
            'blue': 'http://gmaps-samples.googlecode.com/svn/trunk/markers/blue/blank.png',
            'red': 'http://gmaps-samples.googlecode.com/svn/trunk/markers/red/blank.png'
        };
        coloredMarkers = $.extend(defaultColoredMarkers, coloredMarkers);

        this.each(function () {
            // element-specific code here
            // "settings" may be used here
            var map = $(this).data('map');
            var addressSelector = settings.addressSelector;
            var latitudeSelector = settings.latitudeSelector;
            var longitudeSelector = settings.longitudeSelector;
            

            map.clearOverlays();
            $(addressSelector).each(function () {
                var address = $(this);
                var lat = $(latitudeSelector, this).val();
                var lng = $(longitudeSelector, this).val();
                
                if (lat.match(/\d+.\d+/) && lng.match(/\d+.\d+/)) {
    
                    var color = settings.defaultColor;
                    
                    $.each(settings.colors, function (key, value) {
                        if (address.is(key)) {
                            color = value;
                        }
                    });

                    // Create our "tiny" marker icon
                    var Icon = new GIcon(G_DEFAULT_ICON);
                    Icon.image = coloredMarkers[color];
                    
                    // Set up our GMarkerOptions object
                    var markerOptions = { icon: Icon };

                    var marker = new GMarker(new GLatLng(lat, lng), markerOptions);
                    GEvent.addListener(marker, "click", function () {
                        // var position = map.fromLatLngToDivPixel(this.getPoint());
                        // position.x = position.x + 20;
                        // position.y = position.y - 10;
                        var link = address.find('a:first');
                        link.click();
                    });
                    map.addOverlay(marker);
                }
            });
        });

        return this;
    };
    
    // address is:
    // * a string
    // * an object (attributes: longitude, latitude)
    
    // triggers events:
    // * markeradded: marker, point
    // * markermoved: marker, point
    
    $.fn.drawMarker = function (address, settings) {

        var defaultSettings = { 'markerDraggable': true,
                                'clearOverlays': true };
        var settings = $.extend(defaultSettings, settings);
        
        address = fuzzyInterpret(address);
        

        this.each(function () {
            // element-specific code here
            // "settings" may be used here
            var selectedElement = $(this);
            
            var map = $(this).data('map');
            if (!map) {
                return;
            }
        
            var addAddressToMap = function (point) {
            
                if (settings.clearOverlays) {
                    map.clearOverlays();
                }
                
                var marker = new GMarker(point, {draggable: settings.markerDraggable});
                if (settings.markerDraggable) {
                    GEvent.addListener(marker, "dragend", function (point) {
                        selectedElement.trigger('markermoved', [ marker, point ]);
                    });
                }
                
                map.addOverlay(marker);

                map.setCenter(point, 13);
                selectedElement.trigger('markeradded', [ marker, point ]);
            };
            
            
            if (address.type === 'auto') {
                var point = map.getCenter();
                addAddressToMap(point);
            } else if (address.type === 'static') {
                var point = new GLatLng(address.latitude, address.longitude);
                addAddressToMap(point);
            } else if (address.type === 'locate' && geocoder) {
                geocoder.getLocations(address.address, function (response) {
                    var point = null;
                    if (!response || response.Status.code !== 200 || 
                            response.Placemark.length === 0) {
                        // alert("Sorry, we were unable to geocode that address");
                        point = map.getCenter()
                   } else {
                        place = response.Placemark[0];
                        point = new GLatLng(place.Point.coordinates[1], place.Point.coordinates[0]);
                    }
                    addAddressToMap(point);

               });
            }
        });

        return this;
    };

    $.fn.trimVal = function () {
        return $.trim($(this).val());
    };
    
    $.serializeAddress = function (userSettings) {
        var defaultSettings = {'street': '',
                                'zip': '',
                                'city': '',
                                'country': 'Ã–sterreich'
                };

        var s = $.extend(defaultSettings, userSettings);
    
        var address = (s.street === "" ? "" : s.street + ", ") +
                (s.zip === "" ? "" : s.zip + ' ') +
                (s.city === "" ? "" : s.city) +
                (s.country === "" ? "" : ", " + s.country);
        return address;
    };
  
}) (jQuery);

