'use strict';

(function() {
  function initializeTrainsFeature(options) {
    const {
      getMap,
      state,
      adminFeaturesAllowed,
      updateToggleButton,
      onVisibilityChange,
      onFetchPromiseChange,
      TRAINS_ENDPOINT,
      TRAIN_TARGET_STATION_CODE
    } = options || {};

    if (typeof adminFeaturesAllowed !== 'function') {
      throw new Error('adminFeaturesAllowed callback is required');
    }
    if (!state) {
      throw new Error('Trains feature state is required');
    }

    const moduleState = state;

    function getMapInstance() {
      return typeof getMap === 'function' ? getMap() : null;
    }

    function setFetchPromise(promise) {
      moduleState.fetchPromise = promise || null;
      if (typeof onFetchPromiseChange === 'function') {
        try {
          onFetchPromiseChange(moduleState.fetchPromise);
        } catch (error) {
          console.error('Error notifying fetch promise change:', error);
        }
      }
    }

    function getTrainNameBubbleKey(trainID) {
      if (trainID === null || trainID === undefined) {
        return 'train:';
      }
      const text = `${trainID}`;
      return text.startsWith('train:') ? text : `train:${text}`;
    }

    function removeTrainNameBubble(trainID) {
      if (trainID === null || trainID === undefined) {
        return;
      }
      const key = getTrainNameBubbleKey(trainID);
      const bubble = moduleState.nameBubbles[key];
      const map = getMapInstance();
      if (bubble?.nameMarker && map) {
        if (typeof map.hasLayer === 'function' && map.hasLayer(bubble.nameMarker)) {
          map.removeLayer(bubble.nameMarker);
        } else if (typeof bubble.nameMarker.remove === 'function') {
          bubble.nameMarker.remove();
        }
      }
      delete moduleState.nameBubbles[key];
    }

    function clearAllTrainNameBubbles() {
      const map = getMapInstance();
      Object.keys(moduleState.nameBubbles).forEach(key => {
        const bubble = moduleState.nameBubbles[key];
        if (bubble?.nameMarker && map) {
          if (typeof map.hasLayer === 'function' && map.hasLayer(bubble.nameMarker)) {
            map.removeLayer(bubble.nameMarker);
          } else if (typeof bubble.nameMarker.remove === 'function') {
            bubble.nameMarker.remove();
          }
        }
      });
      moduleState.nameBubbles = {};
    }

    function ensureTrainMarkerState(trainID) {
      if (trainID === null || trainID === undefined) {
        return null;
      }
      const key = `${trainID}`;
      const existing = moduleState.markerStates[key];
      if (existing) {
        if (!existing.markerId) {
          existing.markerId = `train-${key.replace(/\s+/g, '-')}`;
        }
        return existing;
      }
      const defaultFill = typeof BUS_MARKER_DEFAULT_ROUTE_COLOR === 'string'
        ? BUS_MARKER_DEFAULT_ROUTE_COLOR
        : '#0f172a';
      const newState = {
        trainID: key,
        markerId: `train-${key.replace(/\s+/g, '-')}`,
        positionHistory: [],
        headingDeg: typeof BUS_MARKER_DEFAULT_HEADING === 'number' ? BUS_MARKER_DEFAULT_HEADING : 0,
        fillColor: defaultFill,
        glyphColor: typeof computeBusMarkerGlyphColor === 'function'
          ? computeBusMarkerGlyphColor(defaultFill)
          : '#ffffff',
        accessibleLabel: 'Amtrak train',
        isStale: false,
        isStopped: false,
        lastLatLng: null,
        marker: null,
        size: null,
        lastUpdateTimestamp: 0,
        routeName: ''
      };
      moduleState.markerStates[key] = newState;
      return newState;
    }

    function clearTrainMarker(trainID) {
      if (trainID === null || trainID === undefined) {
        return;
      }
      const key = `${trainID}`;
      const map = getMapInstance();
      const marker = moduleState.markers[key];
      if (marker) {
        if (map && typeof map.hasLayer === 'function' && map.hasLayer(marker)) {
          map.removeLayer(marker);
        } else if (typeof marker.remove === 'function') {
          marker.remove();
        }
      }
      delete moduleState.markers[key];
      delete moduleState.markerStates[key];
      removeTrainNameBubble(key);
    }

    function clearAllMarkers() {
      const map = getMapInstance();
      Object.keys(moduleState.markers).forEach(trainID => {
        const marker = moduleState.markers[trainID];
        if (!marker) {
          return;
        }
        if (map && typeof map.hasLayer === 'function' && map.hasLayer(marker)) {
          map.removeLayer(marker);
        } else if (typeof marker.remove === 'function') {
          marker.remove();
        }
      });
      moduleState.markers = {};
      moduleState.markerStates = {};
      clearAllTrainNameBubbles();
    }

    function updateVisibilityState(visible) {
      moduleState.visible = !!visible;
      if (typeof onVisibilityChange === 'function') {
        try {
          onVisibilityChange(moduleState.visible);
        } catch (error) {
          console.error('Error notifying train visibility change:', error);
        }
      }
      if (typeof updateToggleButton === 'function') {
        try {
          updateToggleButton();
        } catch (error) {
          console.error('Error updating train toggle button:', error);
        }
      }
    }

    async function updateTrainMarkersVisibility() {
      if (!adminFeaturesAllowed()) {
        clearAllMarkers();
        return;
      }
      if (!moduleState.visible) {
        const map = getMapInstance();
        Object.keys(moduleState.markers).forEach(trainID => {
          const marker = moduleState.markers[trainID];
          if (!marker) {
            return;
          }
          if (map && typeof map.hasLayer === 'function' && map.hasLayer(marker)) {
            map.removeLayer(marker);
          } else if (typeof marker.remove === 'function') {
            marker.remove();
          }
          const state = moduleState.markerStates[trainID];
          if (state) {
            state.marker = marker || null;
          }
        });
        clearAllTrainNameBubbles();
        return;
      }
      const map = getMapInstance();
      if (!map || typeof map.getBounds !== 'function') {
        return;
      }
      const bounds = map.getBounds();
      if (!bounds || typeof bounds.contains !== 'function') {
        return;
      }
      const zoom = typeof map.getZoom === 'function' ? map.getZoom() : BUS_MARKER_BASE_ZOOM;
      const metrics = typeof computeBusMarkerMetrics === 'function' ? computeBusMarkerMetrics(zoom) : null;
      for (const trainID of Object.keys(moduleState.markerStates)) {
        const stateEntry = moduleState.markerStates[trainID];
        if (!stateEntry) {
          continue;
        }
        const latLng = stateEntry.lastLatLng;
        const marker = moduleState.markers[trainID];
        if (!latLng || !Number.isFinite(latLng.lat) || !Number.isFinite(latLng.lng)) {
          if (marker && map && typeof map.hasLayer === 'function' && map.hasLayer(marker)) {
            map.removeLayer(marker);
          }
          stateEntry.marker = marker || null;
          removeTrainNameBubble(trainID);
          continue;
        }
        if (!bounds.contains(latLng)) {
          if (marker && map && typeof map.hasLayer === 'function' && map.hasLayer(marker)) {
            map.removeLayer(marker);
          }
          stateEntry.marker = marker || null;
          removeTrainNameBubble(trainID);
          continue;
        }
        if (metrics && typeof setBusMarkerSize === 'function') {
          setBusMarkerSize(stateEntry, metrics);
        }
        let icon = null;
        try {
          if (typeof createBusMarkerDivIcon === 'function') {
            icon = await createBusMarkerDivIcon(stateEntry.markerId || `train-${trainID}`, stateEntry);
          }
        } catch (error) {
          console.error('Failed to create train marker icon:', error);
          icon = null;
        }
        if (!icon) {
          continue;
        }
        let trainMarker = marker;
        if (!trainMarker) {
          if (typeof L === 'undefined' || typeof L.marker !== 'function') {
            continue;
          }
          trainMarker = L.marker(latLng, {
            icon,
            pane: 'busesPane',
            interactive: false,
            keyboard: false
          });
          moduleState.markers[trainID] = trainMarker;
        } else if (typeof trainMarker.setIcon === 'function') {
          trainMarker.setIcon(icon);
        }
        stateEntry.marker = trainMarker;
        if (map && typeof map.hasLayer === 'function' && typeof trainMarker.addTo === 'function' && !map.hasLayer(trainMarker)) {
          trainMarker.addTo(map);
        }
        if (typeof animateMarkerTo === 'function') {
          animateMarkerTo(trainMarker, latLng);
        }

        const routeColor = stateEntry.fillColor || BUS_MARKER_DEFAULT_ROUTE_COLOR;
        const labelText = typeof stateEntry.routeName === 'string' ? stateEntry.routeName.trim() : '';
        const bubbleKey = getTrainNameBubbleKey(trainID);
        if (typeof adminMode !== 'undefined' && typeof kioskMode !== 'undefined' && adminMode && !kioskMode && labelText) {
          let nameIcon = null;
          if (typeof createNameBubbleDivIcon === 'function') {
            nameIcon = createNameBubbleDivIcon(labelText, routeColor, metrics ? metrics.scale : 1, stateEntry.headingDeg);
          }
          if (nameIcon) {
            const bubble = moduleState.nameBubbles[bubbleKey] || { trainID };
            if (bubble.nameMarker && typeof animateMarkerTo === 'function') {
              animateMarkerTo(bubble.nameMarker, latLng);
              if (typeof bubble.nameMarker.setIcon === 'function') {
                bubble.nameMarker.setIcon(nameIcon);
              }
            } else if (typeof L !== 'undefined' && typeof L.marker === 'function') {
              bubble.nameMarker = L.marker(latLng, { icon: nameIcon, interactive: false, pane: 'busesPane' });
              if (typeof bubble.nameMarker.addTo === 'function' && map) {
                bubble.nameMarker.addTo(map);
              }
            }
            bubble.trainID = trainID;
            bubble.lastScale = metrics ? metrics.scale : 1;
            moduleState.nameBubbles[bubbleKey] = bubble;
          } else {
            removeTrainNameBubble(trainID);
          }
        } else {
          removeTrainNameBubble(trainID);
        }
      }
    }

    function getStationCodeFilter() {
      if (typeof TRAIN_TARGET_STATION_CODE === 'string') {
        return TRAIN_TARGET_STATION_CODE.trim().toUpperCase();
      }
      return '';
    }

    function setVisibility(visible) {
      const allowTrains = adminFeaturesAllowed();
      const desiredVisibility = allowTrains && !!visible;
      const previousVisibility = !!moduleState.visible;
      updateVisibilityState(desiredVisibility);
      const updatePromise = updateTrainMarkersVisibility();
      if (updatePromise && typeof updatePromise.catch === 'function') {
        updatePromise.catch(error => console.error('Error updating train markers visibility:', error));
      }
      if (desiredVisibility && !previousVisibility) {
        fetchTrains().catch(error => console.error('Failed to fetch trains:', error));
      }
      return updatePromise;
    }

    function toggleVisibility() {
      return setVisibility(!moduleState.visible);
    }

    async function fetchTrains() {
      if (moduleState.fetchPromise) {
        return moduleState.fetchPromise;
      }
      if (!adminFeaturesAllowed()) {
        return Promise.resolve();
      }
      if (!moduleState.visible) {
        return Promise.resolve();
      }
      const fetchTask = (async () => {
        if (!moduleState.visible) {
          return;
        }
        const stationCode = getStationCodeFilter();
        let payload;
        try {
          const response = await fetch(TRAINS_ENDPOINT, { cache: 'no-store' });
          if (!response || !response.ok) {
            const statusText = response ? `${response.status} ${response.statusText}` : 'No response';
            throw new Error(statusText);
          }
          payload = await response.json();
        } catch (error) {
          console.error('Failed to fetch trains:', error);
          return;
        }
        if (!moduleState.visible) {
          return;
        }
        const seenTrainIds = new Set();
        const timestamp = Date.now();
        if (payload && typeof payload === 'object') {
          Object.values(payload).forEach(group => {
            if (!Array.isArray(group)) {
              return;
            }
            group.forEach(train => {
              if (stationCode && typeof trainIncludesStation === 'function' && !trainIncludesStation(train, stationCode)) {
                return;
              }
              const identifier = typeof getTrainIdentifier === 'function'
                ? getTrainIdentifier(train)
                : (train?.trainID ?? train?.trainId ?? train?.trainNumRaw ?? train?.trainNum);
              if (!identifier) {
                return;
              }
              seenTrainIds.add(identifier);
              const stateEntry = ensureTrainMarkerState(identifier);
              if (!stateEntry) {
                return;
              }
              const lat = Number(train?.lat);
              const lon = Number(train?.lon);
              const fillColor = typeof normalizeRouteColor === 'function'
                ? normalizeRouteColor(train?.iconColor)
                : train?.iconColor;
              const rawTextColor = typeof train?.textColor === 'string' ? train.textColor.trim() : '';
              const glyphColor = rawTextColor.length > 0 && typeof normalizeGlyphColor === 'function'
                ? normalizeGlyphColor(rawTextColor, fillColor)
                : (typeof computeBusMarkerGlyphColor === 'function'
                  ? computeBusMarkerGlyphColor(fillColor)
                  : '#ffffff');
              stateEntry.fillColor = fillColor;
              stateEntry.glyphColor = glyphColor;
              stateEntry.accessibleLabel = typeof buildTrainAccessibleLabel === 'function'
                ? buildTrainAccessibleLabel(train)
                : 'Amtrak train';
              stateEntry.isStale = false;
              stateEntry.isStopped = false;
              stateEntry.lastUpdateTimestamp = timestamp;
              stateEntry.routeName = typeof train?.routeName === 'string' ? train.routeName.trim() : '';
              const headingValue = typeof getTrainHeadingValue === 'function'
                ? getTrainHeadingValue(train)
                : train?.heading;
              if (Number.isFinite(lat) && Number.isFinite(lon) && typeof L !== 'undefined' && typeof L.latLng === 'function') {
                const latLng = L.latLng(lat, lon);
                stateEntry.lastLatLng = latLng;
                if (typeof updateTrainMarkerHeading === 'function') {
                  stateEntry.headingDeg = updateTrainMarkerHeading(stateEntry, latLng, headingValue);
                }
              } else {
                stateEntry.lastLatLng = null;
                if (typeof updateTrainMarkerHeading === 'function') {
                  stateEntry.headingDeg = updateTrainMarkerHeading(stateEntry, null, headingValue);
                }
              }
            });
          });
        }
        Object.keys(moduleState.markerStates).forEach(trainID => {
          if (!seenTrainIds.has(trainID)) {
            clearTrainMarker(trainID);
          }
        });
        try {
          await updateTrainMarkersVisibility();
        } catch (error) {
          console.error('Error updating train markers visibility:', error);
        }
      })();
      setFetchPromise(fetchTask.finally(() => {
        setFetchPromise(null);
      }));
      return moduleState.fetchPromise;
    }

    updateVisibilityState(!!moduleState.visible);

    return {
      setVisibility,
      toggleVisibility,
      updateTrainMarkersVisibility,
      fetchTrains,
      clearAllMarkers,
      removeTrainNameBubble
    };
  }

  window.initializeTrainsFeature = initializeTrainsFeature;
})();
