"use strict";

(function ($) {
    if (!GBrowserIsCompatible()) {
        return;
    }
    var geocoder = new GClientGeocoder();
    $(document).unload(GUnload);
    
    var fuzzyInterpretValue = function (obj) {
        obj = obj || {};
        if (typeof(obj) === 'string') {
            return { 'type': 'locate', 'address': obj };
        }
        if ( typeof(obj) === 'object' ) {
            if (obj.lat && obj.lng) {
                obj.longitude = ($.isFunction(obj.lng) ? obj.lng() : obj.lng);
                obj.latitude = ($.isFunction(obj.lat) ? obj.lat() : obj.lat);
            }
            if (!obj.type) {
                if (obj.longitude && obj.latitude) {
                    obj.type = 'static';
                } else if ( obj.address) {
                    obj.type = 'locate';
                } else {
                    obj.type = 'auto';
                }
            }
        }
        return obj;
    };
    
    var fuzzyInterpretList = function (list) {
        list = list || [ { 'type': 'auto' } ];
        
        if (! $.isArray(list) ) {
            list = [ list ];
        }
        
        $.each(list, function (index, value) {
            list[index] = fuzzyInterpretValue(value)
        });
        return list;
    };

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
    // * moveend: center, northEast, southWest
    // * initialized: map
    $.fn.createMap = function (centers, settings) {

        var defaultSettings = { 'defaultZoom': 11,
                                'scroll': true,
                                'onlyNormalMapType': true };
        var settings = $.extend(defaultSettings, settings);

        centers = fuzzyInterpretList(centers);

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
                
                var delegatedEvents = "click dblclick";
                delegatedEvents = delegatedEvents.split(' ');
                $.each(delegatedEvents, function (index, eventname) {
                    GEvent.addListener(map, eventname, function () {
                        var params = [];
                        
                        $.each(arguments, function (index, param) {
                            if (index > 0) {
                                params.push(param);
                            }
                        });
                        $(domElement).trigger('map' + eventname, params);
                    });
                });
            };
            
            // *****
            // initializing controller elements
            if (selectedElement.length !== 1) {
                throw 'Containing more than one element.';
            }
            var map = new GMap2(this);
            map.setUIToDefault();

            var customUI = map.getDefaultUI();
            if (!settings.scroll) {
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

                    var foundAddress = function (point) {
                        if (point !== null) {
                            callback(point);
                        }
                    };
                
                    if (geocoder && value.address !== '') {
                        geocoder.getLatLng(value.address, foundAddress);
                        return false;
                    }
                }
            });
        });
        return this;
    };

    // address is:
    // * a string
    // * an object (attributes: longitude, latitude)
    // * a list of objects
    
    // triggers events:
    // * markeradded: marker, point
    // * markermoved: marker, point
    $.fn.drawMarker = function (addresses, settings) {

        var defaultSettings = { 'clear': true,
                                'center': true,
                                'draggable': true,
                                'options': {} };
        var settings = $.extend(defaultSettings, settings);
        
        addresses = fuzzyInterpretList(addresses);
        
        var markerOptions = $.extend({ 'draggable': settings.draggable },
                                        settings.options );

        this.each(function () {
            var selectedElement = $(this);
            
            var map = $(this).data('map');
            if (!map) {
                return;
            }
        
            if (settings.clear) {
                map.clearOverlays();
            }
            
            $.each(addresses, function (index, address) {
                var addAddressToMap = function (point) {
                    var marker = new GMarker(point, markerOptions);
                    if (settings.draggable) {
                        GEvent.addListener(marker, "dragend", function (point) {
                            selectedElement.trigger('markermoved', [ marker, point ]);
                        });
                    }
                    
                    map.addOverlay(marker);
    
                    if (settings.center) {
                        map.setCenter(point, address.zoom || 13);
                    }
                    selectedElement.trigger('markeradded', [ marker, point ]);
                };
            
                if (address.type === 'auto') {
                    var point = map.getCenter();
                    addAddressToMap(point);
                } else if (address.type === 'static') {
                    var point = new GLatLng(address.latitude, address.longitude);
                    addAddressToMap(point);
                } else if (address.type === 'locate' && geocoder) {
                    geocoder.getLatLng(address.address, function (point) {
                        if (point === null) {
                            // alert("Sorry, we were unable to geocode that address");
                            point = map.getCenter()
                        }
                        addAddressToMap(point);
                   });
                }
            });
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

