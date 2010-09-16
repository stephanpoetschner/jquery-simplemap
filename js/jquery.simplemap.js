"use strict";

(function ($) {
    if (!window.GBrowserIsCompatible || !GBrowserIsCompatible()) {
        throw "Error when initializing GMaps API in jquery.simplemap.js";
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
    // * mapmoveend: center, northEast, southWest
    // * mapinitialized: map, uiOptions (if defaultUi is enabled)
    $.fn.createMap = function (centers, settings) {

        var defaultSettings = { 'defaultZoom': 11,
                                'scroll': true,
                                'onlyNormalMapType': true,
                                'defaultUi': true }; // if set, scroll and onlyNormalMapType are unused
        var settings = $.extend(defaultSettings, settings);

        this.each(function () {
            var selectedElement = $(this);
            
            var addEvents = function (map, domElement) {
                // see http://code.google.com/intl/de-AT/apis/maps/documentation/reference.html#GMap2.Events
                GEvent.addListener(map, "addoverlay", function (overlay) {
                    var overlays = selectedElement.data('_overlays') || {};
                    var name = $(overlay).data('_name');
                    var named_overlays = overlays[name] || [];
                    named_overlays.push(overlay);
                    overlays[name] = named_overlays;
                    selectedElement.data('_overlays', overlays);
                });
                GEvent.addListener(map, "removeoverlay", function (overlay) {
                    var overlays = selectedElement.data('_overlays');
                    var name = $(overlay).data('_name');
                    var named_overlays = overlays[name];
                    named_overlays.splice($.inArray(named_overlays, overlay), 1);
                    overlays[name] = named_overlays;
                    selectedElement.data('_overlays', overlays);
                });
                
                GEvent.addListener(map, "moveend", function () {
                    var center = map.getCenter();
                    var bounds = map.getBounds();
                    var southWest = bounds.getSouthWest();
                    var northEast = bounds.getNorthEast();
                    
                    $(domElement).trigger('mapmoveend', [ map, center, northEast, southWest]);
                });
                
                var delegatedEvents = "addmaptype removemaptype click dblclick";
                delegatedEvents += " singlerightclick movestart move zoomend";
                delegatedEvents += " maptypechanged infowindowopen infowindowbeforeclose";
                delegatedEvents += " infowindowclose addoverlay removeoverlay";
                delegatedEvents += " clearoverlays mouseover mouseout";
                delegatedEvents += " dragstart drag dragend load";
                
                delegatedEvents = delegatedEvents.split(' ');
            
                var manualEvent = [ 'moveend' ];
                
                $.each(delegatedEvents, function (index, eventname) {
                    if ($.inArray(manualEvent, eventname) === -1) {
                        GEvent.addListener(map, eventname, function () {
                            $(selectedElement).trigger('map' + eventname, 
                                $.merge([ map ], arguments));
                        });
                    }
                });
            };
            
            // *****
            // initializing controller elements
            if (selectedElement.length !== 1) {
                throw 'Containing more than one element.';
            }
            var map = new GMap2(this);

            if (settings.defaultUi) {
                var customUI = map.getDefaultUI();
                if (!settings.scroll) {
                    customUI.zoom.scrollwheel = false;
                }
                
                if (settings.onlyNormalMapType) {
                    customUI.maptypes.hybrid = false;
                    customUI.maptypes.satellite = false;
                    customUI.maptypes.physical = false;
                }
            }
            
            selectedElement.data('_map', map);
            $(this).trigger('mapinitialized', [ map, customUI ]);
            
            if (settings.defaultUi) {
                map.setUI(customUI);
            }
            
            addEvents(map, this);
            
            selectedElement.centerMap(centers, settings);
        });
        return this;
    };
    
    $.fn.centerMap = function (centers, settings) {
        var defaultSettings = { 'defaultZoom': 11 };
        var settings = $.extend(defaultSettings, settings);

        centers = fuzzyInterpretList(centers);

        this.each(function () {
            var selectedElement = $(this);
            var map = selectedElement.data('_map');

            var getCenterMapCallback = function (zoomlevel) {
                zoomlevel = zoomlevel || settings.defaultZoom;
                var centerMap = function (center) {
                    map.setCenter(center, parseInt(zoomlevel, 10));

                    var bounds = map.getBounds();
                    var southWest = bounds.getSouthWest();
                    var northEast = bounds.getNorthEast();
                    
                    $(selectedElement).trigger('moveend', [ map, center, northEast, southWest]);
                };

                return centerMap;
            };

            // centering map
            $.each(centers, function (index, value) {
                var callback = getCenterMapCallback(value.zoom);
                if (value.type === 'static' &&
                   value.latitude !== '' && value.latitude !== '0' &&
                   value.longitude !== '' && value.longitude !== '0') {
                    $(map).queue('center', function () {
                        var center = new GLatLng(value.latitude, value.longitude);
                        callback(center);
                        
                        $(map).clearQueue('center');
                    });
                } else if (value.type === 'auto') {
                    $(map).queue('center', function () {
                        var queue_item = $(this);
                        var setLocation = function (position) {
                            var lat = position.latitude || position.coords.latitude;
                            var lng = position.longitude || position.coords.longitude;
                            var center = new GLatLng(lat, lng);
                            callback(center);
    
                            $(map).clearQueue('center');
                        };
                        /*
                        if (settings.useHtmlGeolocator &&
                            navigator && navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(setLocation);
                        } else
                        */
                        if (google.loader && google.loader.ClientLocation) {
                            var clientLocation = google.loader.ClientLocation;
                            setLocation(clientLocation);
                        } else {
                            // remove function from queue but keep other 
                            // localization requests in queue
                            queue_item.dequeue('center');
                        }
                    });
                } else if (value.type === 'locate') {

                    $(map).queue('center', function () {
                        var queue_item = $(this);
                        var foundAddress = function (point) {
                            if (point !== null) {
                                callback(point);
                                
                                $(map).clearQueue('center');
                            }
                        };
                    
                        if (geocoder && value.address !== '') {
                            geocoder.getLatLng(value.address, foundAddress);
                        } else {
                            queue_item.dequeue('center');
                        }
                    });
                }
            });
            $(map).dequeue('center');
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
    $.fn.addMarker = function (addresses, settings) {

        var defaultSettings = { 'clear': true,
                                'name': 'undefined',
                                'markerOptions': {
                                    'center': true,
                                    'closeInfoOnLeave': true,
                                    'draggable': true,
                                    'icon':null,
                                    'info': null,
                                    'infoOnHover': false,
                                    'zoom': 13
                                  }
                               };
        
        settings = settings || {};
        
        // move all misplaced "options" param to "markerOptions"
        if (settings.options && !settings.markerOptions) {
            settings.markerOptions = settings.options;
            delete settings['options'];
        }
        if (!settings.markerOptions) {
            settings.markerOptions = {};
        }
        // move all misplaced single option params into markerOptions
        $.each(settings, function (key, val)  {
            if (settings[key] !== undefined && 
                !(key in defaultSettings)) {
                settings.markerOptions[key] = settings[key];
                delete settings[key];
            }
        });
        settings.markerOptions = $.extend(defaultSettings.markerOptions, 
                                          settings.markerOptions);
        var settings = $.extend(defaultSettings, settings);
        
        addresses = fuzzyInterpretList(addresses);
        
        this.each(function () {
            var selectedElement = $(this);
            
            var map = $(this).data('_map');
            if (!map) {
                return;
            }
        
            if (settings.clear) {
                map.clearOverlays();
            }
            
            $.each(addresses, function (index, address) {
                if (!address.markerOptions) {
                    address.markerOptions = {};
                }
                // move all misplaced option params
                $.each(defaultSettings.markerOptions, function (key, val)  {
                    if (address[key] !== undefined) {
                        address.markerOptions[key] = address[key];
                        delete address[key];
                    }
                });
                
                address.markerOptions = $.extend({}, settings.markerOptions,
                                                 address.markerOptions);
                var addAddressToMap = function (point) {
                    var markerOverlay = new GMarker(point, address.markerOptions);
                    if (address.markerOptions.draggable) {
                        GEvent.addListener(markerOverlay, "dragend", function (point) {
                            selectedElement.trigger('markermoved', [ map, markerOverlay, point ]);
                        });
                    }
                    
                    $(markerOverlay).data('_name', settings.name)
                    map.addOverlay(markerOverlay);
                    
                    if (address.markerOptions.info) {
                        GEvent.addListener(markerOverlay, 
                            (address.markerOptions.infoOnHover ? 
                                                'mouseover' : 
                                                'click'), 
                            function () {
                                map.openInfoWindowHtml(point, 
                                                       address.markerOptions.info);
                            });
                        if (address.markerOptions.infoOnHover && 
                            address.markerOptions.closeInfoOnLeave) {
                            GEvent.addListener(markerOverlay, 'mouseout',
                                function () {
                                    map.closeInfoWindow();
                                });
                        }
                    }
    
                    if (address.markerOptions.center) {
                        $(map).clearQueue('center');
                        $(map).queue('center', function () {
                            selectedElement.one('mapmoveend', function () {
                                var targetZoom = address.markerOptions.zoom;
                                map.setZoom(targetZoom);
                            });
                            map.panTo(point);
                            $(this).dequeue('center');
                        });
                        $(map).dequeue('center');
                    }
                    selectedElement.trigger('markeradded', [ map, markerOverlay, point ]);
                };
            
                if (address.type === 'auto') {
                    var point = map.getCenter();
                    addAddressToMap(point);
                } else if (address.type === 'static') {
                    var point = new GLatLng(address.latitude, address.longitude);
                    addAddressToMap(point);
                } else if (address.type === 'locate' && geocoder) {
                    geocoder.setViewport( map.getBounds() ); 
                    geocoder.getLatLng(address.address, function (point) {
                        if (point === null) {
                            // unable to geocode that address
                            point = map.getCenter()
                        }
                        addAddressToMap(point);
                   });
                }
            });
        });

        return this;
    };

    $.fn.removeMarker = function (name) {
        this.each(function () {
            var selectedElement = $(this);
            var map = selectedElement.data('_map');
            var overlays = selectedElement.data('_overlays') || {};
            
            var removeNamedOverlays = function (name) {
                var named_overlays = overlays[name] || [];
                named_overlays = named_overlays.slice(); // clone array
                $.each(named_overlays, function (index, overlay) {
                    map.removeOverlay(overlay);
                });
                overlays[name] = [];
            };
            
            if (name) {
                removeNamedOverlays(name);
            } else {
                $.each(overlays, function (name, overlay) {
                    removeNamedOverlays(name);
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
                                'country': ''
                };

        var s = $.extend(defaultSettings, userSettings);
    
        var address = (s.street === "" ? "" : s.street + ", ") +
                (s.zip === "" ? "" : s.zip + ' ') +
                (s.city === "" ? "" : s.city) +
                (s.country === "" ? "" : ", " + s.country);
        return address;
    };
  
}) (jQuery);
