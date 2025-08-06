// 全域變數初始化
    const map = L.map("map").setView([23.5, 121], 8); // 初始化地圖，中心設為台灣，縮放等級8
    let stationPoints = []; // 儲存測站資料
    let watershedLayer; // 集水區圖層
    let top10Stations = []; // 前十名測站
    let highlightedFeature = null; 

    // 新增：兩個圖層群組，一個用於個別測站，一個用於縣市群聚
    let stationLayerGroup = L.layerGroup(); // 用於個別測站顯示
    let countyClusterLayer = L.layerGroup(); // 用於縣市群聚顯示

    // 添加比例尺
    L.control.scale({
      position: 'bottomleft',
      imperial: false,
      maxWidth: 200
    }).addTo(map);

    // 定義底圖選項
    const baseMaps = {
      "CartoDB Positron": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors, © CartoDB"
      }),
      "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
      }),
      "臺灣通用電子地圖": L.tileLayer("https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}.png", {
        attribution: "© 國土測繪中心"
      }),
      "國土測繪中心正射影像": L.tileLayer("https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", {
        attribution: "© 國土測繪中心"
      })
    };

    // 設定預設底圖
    baseMaps["CartoDB Positron"].addTo(map);

    // 國土測繪中心縣市界圖層
    const cityLayer = L.tileLayer(
      "https://wmts.nlsc.gov.tw/wmts/CITY/default/GoogleMapsCompatible/{z}/{y}/{x}.png",
      {
        attribution: "© 國土測繪中心",
        tileSize: 256,
        maxZoom: 19,
        opacity: 0.6
      }).addTo(map);

    /**
     * 根據雨量值返回對應的顏色。
     * @param {number} rain - 24小時累積雨量 (mm)。
     * @returns {string} - 對應的顏色代碼。
     */
    function getColor(rain) {
      // 根據雨量大小返回對應的顏色，雨量越大顏色越深
      return rain > 300 ? "#FFD5FD" :
             rain > 200 ? "#FF38FB" :
             rain > 150 ? "#DB2CD1" :
             rain > 130 ? "#A920A2" :
             rain > 110 ? "#AA1801" :
             rain > 90  ? "#DB2204" :
             rain > 70  ? "#FF2A08" :
             rain > 50  ? "#FFA71F" :
             rain > 40  ? "#FFD328" :
             rain > 30  ? "#FEFD31" :
             rain > 20  ? "#02FA30" :
             rain > 15  ? "#27A41C" :
             rain > 10  ? "#0177FD" :
             rain > 6   ? "#00A5FE" :
             rain > 2   ? "#01D2FD" :
             rain > 1   ? "#9EFDFF" :
                          "#CACACA";
    }

    /**
     * 顯示前十名測站的排行榜。
     */
    function displayTop10Ranking() {
      const rankingList = document.getElementById("ranking-list");
      rankingList.innerHTML = ""; // 清空現有列表
      top10Stations = stationPoints.sort((a, b) => b.rain - a.rain).slice(0, 10); // 排序並取前十名
      top10Stations.forEach((station, index) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="rank">${index + 1}. ${station.name} (${station.county || ''}${station.town || ''})</span><span class="rain">${Math.round(station.rain)}</span>`;
        li.style.cursor = "pointer";
        // 點擊列表項時，放大地圖並高亮測站
        li.addEventListener("click", () => {
          map.setView([station.lat, station.lon], 13); // 放大到測站層級
          highlightStation(station);
        });
        rankingList.appendChild(li);
      });
    }
   

    /**
     * 高亮顯示選中的測站。
     * 如果地圖縮放等級不足以顯示個別測站，會先放大地圖。
     * @param {object} station - 要高亮的測站資料。
     */
    function highlightStation(station) {
      clearHighlight(); // 先清除之前的高亮

      const zoomThreshold = 11;
      const currentZoom = map.getZoom();

      if (currentZoom < zoomThreshold) {
          map.setView([station.lat, station.lon], 13);
          requestAnimationFrame(() => highlightStation(station)); 
          return;
      }
      
      stationLayerGroup.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) {
          const layerLatLng = layer.getLatLng();
          if (layerLatLng.lat === station.lat && layerLatLng.lng === station.lon) {
            const originalStyle = {
              radius: layer.options.radius,
              weight: layer.options.weight,
              color: layer.options.color
            };
            layer.setStyle({
              radius: 8,
              weight: 3,
              color: "#ff0000"
            });
            layer.openPopup();
            
            // 記住當前高亮的圖層和其原始樣式
            highlightedFeature = { layer: layer, originalStyle: originalStyle };
            return;
          }
        }
      });
    }
    

    /**
     * 高亮顯示選中的集水區。
     * @param {string} watershedName - 要高亮的集水區名稱。
     */
    function highlightWatershed(watershedName) {
      clearHighlight(); // 先清除之前的高亮

      watershedLayer.eachFeature((layer) => {
        const feature = layer.feature;
        const areaName = feature.properties?.area_name;
        if (areaName === watershedName) {
          const originalStyle = {
            weight: layer.options.weight,
            color: layer.options.color
          };
          layer.setStyle({
            weight: 4,
            color: "#ff0000"
          });
          const bounds = layer.getBounds();
          map.fitBounds(bounds, { padding: [20, 20] });
          layer.openPopup();

          // 記住當前高亮的圖層和其原始樣式
          highlightedFeature = { layer: layer, originalStyle: originalStyle };
        }
      });
    }
    function clearHighlight() {
      if (highlightedFeature) {
        highlightedFeature.layer.setStyle(highlightedFeature.originalStyle);
        highlightedFeature = null;
      }
    }

    /**
     * 在集水區邊界緩衝區內搜尋測站。
     * @param {L.Layer} watershedLayer - 集水區的 Leaflet 圖層。
     * @param {Array<object>} stations - 所有測站的資料陣列。
     * @param {number} bufferDistanceMeters - 緩衝區距離 (米)。
     * @returns {Array<object>} - 在緩衝區內的測站陣列。
     */
    function getStationsWithinBuffer(watershedLayer, stations, bufferDistanceMeters) {
      return stations.filter(station => {
        const stationLatLng = L.latLng(station.lat, station.lon);
        
        // 計算測站到集水區邊界的最短距離
        const minDistance = getMinDistanceToPolygonBounds(stationLatLng, watershedLayer);
        
        // 如果測站在集水區內或在緩衝區內，就包含它
        return minDistance <= bufferDistanceMeters;
      });
    }

    /**
     * 計算點到多邊形邊界矩形的最短距離 (近似值)。
     * @param {L.LatLng} point - 點的經緯度。
     * @param {L.Layer} polygon - 多邊形的 Leaflet 圖層。
     * @returns {number} - 點到多邊形邊界矩形的最短距離 (米)。
     */
    function getMinDistanceToPolygonBounds(point, polygon) {
      const bounds = polygon.getBounds();
      
      // 如果點在邊界內，距離為0
      if (bounds.contains(point)) {
        return 0;
      }
      
      // 計算到邊界矩形的距離
      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const east = bounds.getEast();
      const west = bounds.getWest();
      
      const lat = point.lat;
      const lng = point.lng;
      
      let latDistance = 0;
      let lngDistance = 0;
      
      // 計算緯度方向的距離
      if (lat > north) {
        latDistance = (lat - north) * 111000; // 1度緯度約111公里
      } else if (lat < south) {
        latDistance = (south - lat) * 111000;
      }
      
      // 計算經度方向的距離
      if (lng > east) {
        lngDistance = (lng - east) * 111000 * Math.cos(lat * Math.PI / 180);
      } else if (lng < west) {
        lngDistance = (west - lng) * 111000 * Math.cos(lat * Math.PI / 180);
      }
      
      // 返回總距離 (勾股定理)
      return Math.sqrt(latDistance * latDistance + lngDistance * lngDistance);
    }

    /**
     * 根據地圖縮放等級，顯示縣市群聚或個別測站。
     */
    function updateStationDisplay() {
        let zoomThreshold; // 改為 let，因為值會變動

        // 根據 style.css 的 RWD 斷點 (768px) 來判斷
        if (window.innerWidth <= 768) {
            // 如果是手機版寬度，設定較低的門檻值
            zoomThreshold = 10;
        } else {
            // 如果是電腦版寬度，維持原來的門檻值
            zoomThreshold = 11;
        }

        const currentZoom = map.getZoom();

      // 清除所有測站相關圖層，準備重新繪製
      stationLayerGroup.clearLayers();
      countyClusterLayer.clearLayers();
      
      // 確保兩個圖層都被移除了地圖，待會根據條件重新添加
      map.removeLayer(stationLayerGroup);
      map.removeLayer(countyClusterLayer);

      if (currentZoom < zoomThreshold) {
        // 顯示縣市群聚
        const countyStations = {};
        stationPoints.forEach(station => {
          // 確保 station.county 存在，否則歸類到「未知縣市」
          const countyName = station.county || '未知縣市'; 
          if (!countyStations[countyName]) {
            countyStations[countyName] = [];
          }
          countyStations[countyName].push(station);
        });

        for (const countyName in countyStations) {
          const stationsInCounty = countyStations[countyName];
          if (stationsInCounty.length > 0) {
            // 計算縣市群聚的中心點 (取所有測站的平均經緯度)
            let sumLat = 0;
            let sumLon = 0;
            stationsInCounty.forEach(s => {
              sumLat += s.lat;
              sumLon += s.lon;
            });
            const centerLat = sumLat / stationsInCounty.length;
            const centerLon = sumLon / stationsInCounty.length;

            const clusterMarker = L.marker([centerLat, centerLon], {
              icon: L.divIcon({
                className: 'county-cluster-marker',
                html: `<div>${stationsInCounty.length}測站</div>`, // 顯示該縣市的測站數量
                iconSize: [50, 50],
                iconAnchor: [20, 20]
              })
            });

            clusterMarker.bindTooltip(`<b>${countyName}</b><br>測站數量: ${stationsInCounty.length}`);
            
            // 點擊縣市群聚時，放大地圖並顯示個別測站
            clusterMarker.on('click', function() {
                map.setView([centerLat, centerLon], zoomThreshold);
            });

            countyClusterLayer.addLayer(clusterMarker);
          }
        }
        countyClusterLayer.addTo(map); // 將縣市群聚圖層添加到地圖
      } else {
        // 顯示個別測站
        stationPoints.forEach((station) => {
          const marker = L.circleMarker([station.lat, station.lon], {
            radius: 4.5,
            fillColor: getColor(station.rain),
            color: "#333",
            weight: 1,
            fillOpacity: 0.8,
          });
          // 顯示測站名稱標籤
          const label = L.marker([station.lat, station.lon], {
            icon: L.divIcon({
              className: 'station-label',
              html: station.name,
              iconSize: [null, null],
              iconAnchor: [0, -10]
            })
          });
          
          marker.bindPopup(`<b>${station.name} (${station.county || ''}${station.town || ''})</b><br>24小時累積雨量：${Math.round(station.rain)} mm`);
          stationLayerGroup.addLayer(marker);
          stationLayerGroup.addLayer(label); // 將標籤也添加到測站圖層群組
        });
        stationLayerGroup.addTo(map); // 將個別測站圖層添加到地圖
      }
    }

    /**
     * 顯示超過十年重現期的排水區域列表。
     * @param {Array<object>} redWatershedsData - 超過十年重現期的集水區資料陣列。
     */
    function displayRedWatersheds(redWatershedsData) {
      const redWatershedsList = document.getElementById("red-watersheds");
      redWatershedsList.innerHTML = ""; // 清空現有列表

      console.log("收到的超標排水區域資料:", redWatershedsData);

    // 如果沒有任何資料，就顯示"無"並結束函式
      if (redWatershedsData.length === 0) {
          redWatershedsList.innerHTML = '<li>無</li>';
          return; 
      }

    // 如果有資料，才執行迴圈來顯示列表
      redWatershedsData.forEach((watershedInfo) => {
          const li = document.createElement("li");
          li.innerHTML = `
          <div>
              <span class="watershed">${watershedInfo.name}</span>
              <div style="font-size: 11px; color: #666; margin-top: 2px;">
              觸發測站: ${watershedInfo.triggerStations.join(', ')}
              </div>
          </div>
          `;
          li.className = "clickable-watershed";
          li.style.cursor = "pointer";
          li.addEventListener("click", () => {
          highlightWatershed(watershedInfo.name);
          });
          redWatershedsList.appendChild(li);
      });
    }



    /**
     * 載入集水區資料並添加到地圖。
     */
    function loadWatersheds() {
      // 如果圖層已經存在，則先移除，防止重複添加
      if (watershedLayer) { 
        map.removeLayer(watershedLayer); 
      }
      watershedLayer = L.esri.featureLayer({
        url: "https://gisportal.triwra.org.tw/server/rest/services/Hosted/%E5%8D%80%E5%9F%9F%E6%8E%92%E6%B0%B4%E9%9B%86%E6%B0%B4%E5%8D%8020250806/FeatureServer/0",
        style: function (feature) {
          return {
            color: "#666",
            weight: 1,
            fillColor: "#ccc",
            fillOpacity: 0.4,
          };
        },
        onEachFeature: function (feature, layer) {
          layer.bindPopup(
            `<h3>${feature.properties?.name || "無"}</h3><br>` +
            `<b>2年重現期：</b>${feature.properties?.r_2 || "無"} <br>` +
            `<b>5年重現期：</b>${feature.properties?.r_5 || "無"} <br>` +
            `<b>10年重現期：</b>${feature.properties?.r_10 || "無"} <br>` +
            `<b>25年重現期：</b>${feature.properties?.r_25 || "無"} <br>` +
            `<b>50年重現期：</b>${feature.properties?.r_50 || "無"} <br>` +
            `<b>100年重現期：</b>${feature.properties?.r_100 || "無"} `
          );
        },
        zIndex: 1
      }).addTo(map);

      watershedLayer.on("load", () => {
        console.log("2. 集水區圖資載入完成！");
        const redWatershedsData = [];
        let featureCount = 0; // 1. 在這裡宣告一個計數器
        
        watershedLayer.eachFeature((layer) => {
          featureCount++; // 2. 每處理一個集水區，計數器就 +1
          const feature = layer.feature;
          const props = feature.properties;

          // 將所有重現期數值轉換為數字，方便比較
          const r = {
            100: parseFloat(props?.r_100),
            50: parseFloat(props?.r_50),
            25: parseFloat(props?.r_25),
            10: parseFloat(props?.r_10),
            5: parseFloat(props?.r_5),
            2: parseFloat(props?.r_2)
          };

          // 找出這個集水區內的所有雨量測站
          const stationsInside = getStationsWithinBuffer(layer, stationPoints, 100);
          if (stationsInside.length === 0) {
              // 如果集水區內沒有測站，就設為預設樣式並跳過
              layer.setStyle({
                  fillColor: "#95E605",
                  fillOpacity: 0.2,
                  color: "#666",
                  weight: 1,
              });
              return; 
          }

          // 找出區域內最大的雨量值
          const maxRain = Math.max(...stationsInside.map(s => s.rain));

          // 預設樣式 (正常狀態)
          let fillColor = "#95E605";
          let fillOpacity = 0.2;
          let color = "#666";
          let weight = 1;
          let isHazardous = false; // 用來判斷是否要加入右側列表

          // --- 核心修改：由最嚴重的等級往下判斷 ---
          if (!isNaN(r[100]) && maxRain > r[100]) {
            fillColor = "#8B0000";
            fillOpacity = 0.6;
            isHazardous = true;
          } else if (!isNaN(r[50]) && maxRain > r[50]) {
            fillColor = "#B22222";
            fillOpacity = 0.55;
            isHazardous = true;
          } else if (!isNaN(r[25]) && maxRain > r[25]) {
            fillColor = "#DC143C";
            fillOpacity = 0.5;
            isHazardous = true;
          } else if (!isNaN(r[10]) && maxRain > r[10]) {
            fillColor = "#FF4500";
            fillOpacity = 0.45;
            isHazardous = true;
          } else if (!isNaN(r[5]) && maxRain > r[5]) {
            fillColor = "#FF8C00";
            fillOpacity = 0.4;
          } else if (!isNaN(r[2]) && maxRain > r[2]) {
            fillColor = "#fff050";
            fillOpacity = 0.4;
          }
          
          // 如果達到10年(含)以上的致災等級，就加到右側列表
          if (isHazardous) {
            color = "#BE0202";
            weight = 2;
            const watershedName = props?.name || "未知集水區";
            const triggerStations = stationsInside
                .filter(station => station.rain > r[10]) // 只顯示超過10年重現期的測站
                .map(station => `${station.name}(${Math.round(station.rain)}mm)`);

            redWatershedsData.push({
              name: watershedName,
              triggerStations: triggerStations.length > 0 ? triggerStations : [`最大雨量 ${Math.round(maxRain)}mm`]
            });
          }

          // 套用最終計算出的樣式
          layer.setStyle({
            fillColor: fillColor,
            fillOpacity: fillOpacity,
            color: color,
            weight: weight,
          });
        });

        console.log(`3. 完成 ${featureCount} 個集水區的顏色分析。`);
        displayRedWatersheds(redWatershedsData); 
        updateStationDisplay(); 
      });

      // 定義圖層控制
      const overlayMaps = {
        "雨量測站": stationLayerGroup, // 這個現在控制的是個別測站層
      //"縣市雨量群聚": countyClusterLayer, // 新增縣市群聚作為可切換圖層
        "區域排水": watershedLayer,
        "縣市界": cityLayer,
      };

      // 將圖層控制添加到地圖
      L.control.layers(baseMaps, overlayMaps, { position: "topright" }).addTo(map);
    }

    /**
     * 從中央氣象署 API 載入雨量測站資料。
     */
    function loadStationData() {
      // 從中央氣象署API獲取24小時雨量資料
      fetch("https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=CWA-3136E89E-8A4C-40CB-BCF2-2C1D2E78AF8D&RainfallElement=Past24hr")
        .then((res) => res.json())
        .then((data) => {
          const stations = data.records?.Station || [];
          stations.forEach((station) => {
            const coord = station.GeoInfo?.Coordinates?.find((c) => c.CoordinateName === "WGS84");
            const lat = parseFloat(coord?.StationLatitude);
            const lon = parseFloat(coord?.StationLongitude);
            const rain = parseFloat(station.RainfallElement?.Past24hr?.Precipitation);
            const county = station.GeoInfo?.CountyName; 
            const town = station.GeoInfo?.TownName

            if (!isNaN(lat) && !isNaN(lon) && !isNaN(rain)) {
              stationPoints.push({ lat, lon, rain, name: station.StationName, county, town });
            }
          });
          displayTop10Ranking();
          // 確保在載入測站資料後才載入集水區，因為集水區的渲染依賴測站資料
          loadWatersheds(); 
          updateStationDisplay();
        })
        .catch((err) => {
          console.error("雨量站資料載入失敗", err);
          // 即使資料載入失敗，仍然嘗試載入集水區，只是集水區的顏色可能不會正確反應雨量
          loadWatersheds(); 
        });
    }

    // --- 可調整大小的面板邏輯 ---
    const resizer = document.getElementById('resizer');
    const rankingPanel = document.getElementById('ranking');

    let isResizing = false;

    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        let startX = e.clientX;
        let startWidth = parseInt(document.defaultView.getComputedStyle(rankingPanel).width, 10);

        function doDrag(e) {
            if (!isResizing) return;
            let newWidth = startWidth - (e.clientX - startX);
            rankingPanel.style.width = newWidth + 'px';
            map.invalidateSize(); // 通知地圖重新計算大小
        }

        function stopDrag() {
            isResizing = false;
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        }

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    });


    // 監聽地圖縮放事件，以更新測站顯示模式
    map.on('zoomend', updateStationDisplay);

    function handleResize() {
         updateStationDisplay(); // 更新測站顯示

        // ---【⭐新增邏輯】---
        if (window.innerWidth <= 768) {
            // 如果是手機版，強制移除 collapsed class，確保資訊框總是展開的
            cwaFrame.classList.remove('collapsed');
        }
    }   
    // 監聽視窗大小變化事件，以實現更完整的 RWD 效果
    window.addEventListener('resize', updateStationDisplay);

    // 初始化應用程式
    loadStationData();
    handleResize(); //【⭐新增】在初次載入時也執行一次，確保初始狀態正確

    // CWA 框架收合/展開功能
    const cwaFrame = document.getElementById('cwa-frame');
    const toggleCwaBtn = document.getElementById('toggleCwaBtn');

    toggleCwaBtn.addEventListener('click', () => {
      cwaFrame.classList.toggle('collapsed');
      
      const isCollapsed = cwaFrame.classList.contains('collapsed');
      if (isCollapsed) {
        toggleCwaBtn.innerHTML = '<span class="arrow">&#9654;</span><span class="text">展開</span>'; // 右箭頭+展開
        toggleCwaBtn.title = '展開氣象署資訊';
      } else {
        toggleCwaBtn.innerHTML = '<span class="arrow">&#9664;</span><span class="text">收合</span>'; // 左箭頭+收合
        toggleCwaBtn.title = '收合氣象署資訊';
      }

      // 在過渡動畫完成後，通知 Leaflet 地圖重新計算大小
      setTimeout(() => {
        map.invalidateSize();
      }, 300); 
    });

    // --- 新增：圖例收合功能 ---
    const legend = document.getElementById('legend');
    const legendHeader = legend.querySelector('.legend-header');

    legendHeader.addEventListener('click', () => {
        legend.classList.toggle('collapsed');
    });
