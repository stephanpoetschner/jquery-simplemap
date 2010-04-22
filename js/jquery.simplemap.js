"use strict";

(function ($) {
    // attaches events:
    // * movend: center, northEast, southWest
    // * initialized: map
    
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
    $.fn.createMap = function (centers, settings) {
        if (!GBrowserIsCompatible()) {
            return;
        }

        var defaultSettings = { 'defaultZoom': 11,
                                'enableScroll': true,
                                'onlyNormalMapType': true };
        var settings = $.extend(defaultSettings, settings);

        centers = centers || [ { 'type': 'auto', } ];
        
        if (! $.isArray(centers) ) {
            centers = [ centers ];
        }
        
        $.each(centers, function (index, value) {
            if (typeof(value) === 'string') {
                centers[index] = { 'type': 'locate', 'address': value };
            }
            if ( $.isPlainObject(value) && !value.type ) {
                if (value.longitude && value.latitude) {
                    value.type = 'static';
                } else if ( value.address) {
                    value.type = 'locate';
                } else {
                    value.type = 'auto';
                }
            }
        });

        var geocoder = new GClientGeocoder();
        $(document).unload(GUnload);

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
    
    
    $.fn.findAddress = function (address, userSettings) {

        var defaultSettings = { markerDraggable: true,
                clearOverlays: true };
        var settings = $.extend(defaultSettings, userSettings);
        
        if (typeof(address) === 'string') {
            if ($.trim(address) === "") {
                return;
            }
        }
        
        // element-specific code here
        // "settings" may be used here
        var map = $(this).data('map');
        var geocoder = new GClientGeocoder();

        this.each(function () {
        
            var jquery_element = $(this);
            
            var addAddressToMap = function (point) {
            
                if (settings.clearOverlays) {
            map.clearOverlays();
        }
                
                var marker = new GMarker(point, {draggable: settings.markerDraggable});
                if (settings.markerDraggable) {
                    GEvent.addListener(marker, "dragend", function (point) {
                        jquery_element.trigger('markermoved', [ marker, point ]);
                    });
                }
                
                map.addOverlay(marker);

                map.setCenter(point, 13);
                jquery_element.trigger('markeradded', [ marker, point ]);
            };
            
            
            
            if (typeof(address) === 'string') {
                if (geocoder) {
                    geocoder.getLocations(address, function (response) {
                        var point = null;
                        if (!response || response.Status.code !== 200) {
                            // alert("Sorry, we were unable to geocode that address");
                            point = map.getCenter()

                       } else {
                            place = response.Placemark[0];
                            point = new GLatLng(place.Point.coordinates[1], place.Point.coordinates[0]);
                        }
                        addAddressToMap(point);

                   });
                } else {
                  alert('missing geocoder');
                }
            } else {
        var point = new GLatLng(address.latitude, address.longitude);
        addAddressToMap(point);
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

