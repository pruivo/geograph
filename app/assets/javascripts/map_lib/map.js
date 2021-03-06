var refreshEnabled = false;
var refreshInterval = null;
var refreshTime = 5;

function switchRefresh() {
  var buttonText = "stop refresh";
  if(refreshEnabled) {
    clearInterval(refreshInterval);
    buttonText = "start refresh";
  } else {
    refreshInterval = setInterval(refreshMap, refreshTime * 1000);
  }
  refreshEnabled = !refreshEnabled;
  $("#refresh-button span").html(buttonText);
}

function refreshMap() {
  $.ajax({url:'landmarks_map', dataType:'script'});
}

function changeRefresh(time) {
  refreshTime = time;
  if(refreshEnabled) {
    clearInterval(refreshInterval);
    refreshInterval = setInterval(refreshMap, refreshTime * 1000);
  }
}

var map = null;
var markers = new Hash();
var infoWindows = {};
var currentGeoObjects = new Hash();
var currentEdges = new Hash();
var currentCycle = 0;
var mapEdges = new Hash();
var mapCenterLat = 41.9;
var mapCenterLng = 12.4;
var infoWindowTemplate = '<div id="content-{GEOOBJECTID}"><h2 id="content-heading-{GEOOBJECTID}">{GEOOBJECTTYPE}</h2><div id="body-content-{GEOOBJECTID}">{GEOOBJECTDATA}</div></div>';

function initializeMap() {
  var latlng = new google.maps.LatLng(mapCenterLat, mapCenterLng);
  var myOptions = {
    zoom:2,
    center:latlng,
    mapTypeId:google.maps.MapTypeId.ROADMAP
  };
  map = new google.maps.Map(document.getElementById("map_canvas"), myOptions);

}

function addGeoObjects(geoObjects) {
  geoObjects.each(function(geoObject) {
    currentGeoObjects[geoObject.id] = geoObject;
    addGeoObject(geoObject);
  });
}

function addGeoObject(geoObject) {
  //console.info("Received new geoobject:");
  //console.info(JSON.stringify(geoObject));
  if(geoObject == null || geoObject.data.type == null) {
    console.warn("Invalid GeoObject, ignoring");
    return;
  }
  //var latlng = new google.maps.LatLng(mapCenterLat + (geoObject.latitude/100), mapCenterLng + (geoObject.longitude/100));
  var latlng = new google.maps.LatLng(geoObject.latitude, geoObject.longitude);
 // console.info("-----------");

  markers[geoObject.id] = new google.maps.Marker({
    position:latlng,
    map:map,
    //animation: google.maps.Animation.DROP,
    title:"GeoObject: " + geoObject.id
  });
  // centerMap(latlng);

  //console.info("Added new marker:");

  var icon = null;
  if(geoObject.data.type == "Mover") {
    icon = '/assets/bike.png';
  } else if(geoObject.data.type == "Post") {
    icon = '/assets/post.png';
  } else if(geoObject.data.type == "Track") {
    icon = '/assets/track.png';
  } else if(geoObject.data.type == "Landmark") {
    //icon = '/assets/post.png';
  }

  if(icon == null) {
    return;
  }

  //console.info("Type checked");
  if(icon != null) markers[geoObject.id].setIcon(icon);

  addInfoWindow(geoObject, markers[geoObject.id]);
}

function addInfoWindow(geoObject, marker) {
  var infoWindowContent = infoWindowSource(geoObject);
  var infoWindow = new google.maps.InfoWindow({
    content:infoWindowContent
  });
  google.maps.event.addListener(marker, 'click', function() {
    infoWindow.open(map, marker);
  });
  infoWindows[geoObject.id] = infoWindow;
}

function updateInfoWindow(geoObject) {
  var infoWindowContent = infoWindowSource(geoObject);
  infoWindows[geoObject.id].setContent(infoWindowContent);
}

function infoWindowSource(geoObject) {
  var infoWindowContent = infoWindowTemplate.replace(/{GEOOBJECTID}/g, geoObject.id);
  infoWindowContent = infoWindowContent.replace(/{GEOOBJECTTYPE}/g, geoObject.data['type']);
  infoWindowContent = infoWindowContent.replace(/{GEOOBJECTDATA}/g, geoObject.data['body']);
  return infoWindowContent;
}

function moveGeoObject(geoObject) {
  //var latlng = new google.maps.LatLng(mapCenterLat + (geoObject.latitude/100), mapCenterLng + (geoObject.longitude/100));
  var latlng = new google.maps.LatLng(geoObject.latitude, geoObject.longitude);
  markers[geoObject.id].setPosition(latlng);
  //markers[geoObject.id].setAnimation(google.maps.Animation.DROP);
  //markers[geoObject.id].setAnimation(google.maps.Animation.BOUNCE);
  //setTimeout(function() {markers[geoObject.id].setAnimation(null);}, 500);
  //centerMap(latlng);

  updateInfoWindow(geoObject);
}

function destroyGeoObject(geoObject) {
  if(markers.get(geoObject.id) == null) return;
  markers[geoObject.id].setMap(null);
  markers[geoObject.id] = null;
}

function destroyGeoObjects(ids) {
  ids.each(function(_id) {
    markers[_id].setMap(null);
    markers[_id] = null;
  });
}

function destroyAllGeoObjects() {
  markers.each(function(value, key) {
    value.setMap(null);
    value = null;
  });
  markers = new Hash();
}

function onPercept(perception) {
  var geoObject = perception["data"];

  if(perception["header"]["action"] == "actions::destroy_action") {
    destroyGeoObject(geoObject);
    return;
  }

  if(perception["header"]["action"] == "actions::destroy_posts_action") {
    destroyGeoObjects(geoObject.ids);
    return;
  }

  if(markers[geoObject.id] != undefined) {
    moveGeoObject(geoObject);
  } else {
    addGeoObject(geoObject);
  }
}

function onPostsReadPercept(perception) {
  var posts = perception['data'];
  posts.each(function(post) {
    if(markers[post.id] != null) {
      markers[post.id].setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(function() {
        markers[post.id].setAnimation(null);
      }, 2000);
    }
  });
}

function onEdgesPercept(perception) {
  //removeAllEdges();
  //try{
  var edges = perception["data"];
  edges.each(function(edge) {
    removeEdge(edge);
  });
  edges.each(function(edge) {
    addEdge(edge);
  });
  //} catch(err) {
  //  $log(err.stack);
  //}
}

function addEdges(edges) {
  edges.each(function(edge) {
    currentEdges[edgeIndex(edge)] = edge;
    addEdge(edge);
  });  
}

function addEdge(edge) {
  //$log(JSON.stringify(edge));

  var edgeCoordinates = [
    new google.maps.LatLng(edge.from.latitude, edge.from.longitude),
    new google.maps.LatLng(edge.to.latitude, edge.to.longitude)
  ];

  var edgePath = new google.maps.Polyline({
    path:edgeCoordinates,
    strokeColor:"#FF0000",
    strokeOpacity:1.0,
    strokeWeight:2
  });

  edgePath.setMap(map);
  var edgeIdx = edgeIndex(edge);
  if(mapEdges[edgeIdx] == null) {
    mapEdges[edgeIdx] = [];
  }

  mapEdges[edgeIdx].push(edgePath);
}

function edgeIndex(edge) {

  var sortedIds = [edge.from.id, edge.to.id].sort();
  var index = "";
  sortedIds.each(function(id) {
    return index += id;
  });
  return index;
}

function removeEdge(edge) {
  var edgeIdx = edgeIndex(edge);
  if(mapEdges[edgeIdx] == undefined) return;
  mapEdges[edgeIdx].each(function(mEdge) {
    mEdge.setMap(null);
    mEdge = null;
  });
  mapEdges[edgeIdx] = [];
}

function removeAllEdges() {
  mapEdges.each(function(mEdge) {
    mEdge.setMap(null);
    mEdge = null;
  });
  mapEdges = [];
}

function centerMap(latLng) {
  var bounds = new google.maps.LatLngBounds();
  bounds.extend(latLng);
  map.fitBounds(bounds);
  map.setZoom(8);
}


function refreshEdges(freshEdges) {
  freshEdges.each(function(edge) {
    var _edgeIndex = edgeIndex(edge);
    var existingEdge = currentEdges.get(_edgeIndex);
    // if the edge exists update its position if changed
    if(existingEdge != null) {
      if(edgeChanged(existingEdge, edge)) {
        removeEdge(edge);
        addEdge(edge);
        currentEdges[_edgeIndex] = edge;
      }
      currentEdges[_edgeIndex]['exists_at_cycle'] = currentCycle;
    } else {
      // if the edge don't exists create it
      addEdge(edge);
      currentEdges[_edgeIndex] = edge;
      currentEdges[_edgeIndex]['exists_at_cycle'] = currentCycle;
    }
  });

  // remove edges that not exists in the fresh data
  currentEdges.each(function(edge, key) {
    if(edge['exists_at_cycle'] < currentCycle) {
      removeEdge(edge);
      currentEdges.erase(key);
    }
  });
  currentCycle++;
}

function edgeChanged(edgeA, edgeB) {
  return(
    (edgeA.from.latitude != edgeB.from.latitude) ||
      (edgeA.from.longitude != edgeB.from.longitude) ||
      (edgeA.to.latitude != edgeB.to.latitude) ||
      (edgeA.to.longitude != edgeB.to.longitude)
    )
}

function geoObjectChanged(goA, goB) {
  return(
    (goA.latitude != goB.latitude) ||
      (goA.longitude != goB.longitude) || 
      (goA.data.type != goB.data.type)
    );
}


function refreshGeoObjects(freshGeoObjects) {
  freshGeoObjects.each(function(geoObject) {
    //console.info("received from server:");
    //console.info(JSON.stringify(geoObject));
    var existingGeoObject = currentGeoObjects.get(geoObject.id);
    // if the geoObject exists update its position if changed    
    if(existingGeoObject != null) {
      if(geoObjectChanged(existingGeoObject, geoObject)) {
        destroyGeoObject(existingGeoObject);
        addGeoObject(geoObject);
        currentGeoObjects[geoObject.id] = geoObject;
      }
      currentGeoObjects[geoObject.id]['exists_at_cycle'] = currentCycle;
    } else {
      // if the geo object don't exists create it
      addGeoObject(geoObject);
      currentGeoObjects[geoObject.id] = geoObject;
      currentGeoObjects[geoObject.id]['exists_at_cycle'] = currentCycle;
    }
  });

  // remove geo objects that not exists in the fresh data
  currentGeoObjects.each(function(geoObject, key) {
    if(geoObject['exists_at_cycle'] < currentCycle) {
      destroyGeoObject(geoObject);
      currentGeoObjects.erase(key);
    }
  });
  //    currentCycle++;
}


function slideRefresh() {
  $('.refresh-slider').slider({
    min:1,
    max:60,
    step:1,
    value:refreshTime,
    create:function(event, ui) {
      $(this).slider('value', refreshTime);
    },
    slide:function(event, ui) {
      $("#refresh-label").html(ui.value);
      changeRefresh(ui.value);
    }
  });
}