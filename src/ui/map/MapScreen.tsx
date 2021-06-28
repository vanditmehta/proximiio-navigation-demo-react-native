import * as React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Text,
  ActivityIndicator,
  BackHandler,
  FlatList,
  ListRenderItemInfo,
  TouchableOpacity,
} from 'react-native';
import MapboxGL from '@react-native-mapbox-gl/maps';
import Proximiio, {
  ProximiioContextProvider,
  ProximiioEvents,
  ProximiioLocation,
} from 'react-native-proximiio';
import ProximiioMapbox, {
  ProximiioMapboxEvents,
  UserLocationSource,
  AmenitySource,
  GeoJSONSource,
  RoutingSource,
  ProximiioMapboxRoute,
  ProximiioFeatureType,
  ProximiioRouteEvent,
  ProximiioRouteUpdateType,
  Feature,
} from 'react-native-proximiio-mapbox';
import RoutePreview from './RoutePreview';
import {FAB} from 'react-native-paper';
import RouteNavigation from './RouteNavigation';
import CardView from '../../utils/CardView';
import FloorPicker from './FloorPicker';
import {Colors} from '../../Style';
import {ProximiioFloor} from 'react-native-proximiio';
import {MAP_STARTING_BOUNDS} from '../../utils/Constants';
import i18n from 'i18next';
import {categoryList, SearchCategory} from '../../utils/SearchCategories';
import FontAwesome5Icon from 'react-native-vector-icons/FontAwesome5';
import {RouteProp} from '@react-navigation/native';
import PreferenceHelper from '../../utils/PreferenceHelper';
import MapCardView from './MapCardView';
import {TouchableHighlight} from 'react-native-gesture-handler';

interface Props {
  onOpenSearch: (searchCategory?: SearchCategory) => void;
  onOpenPoi: (poi: Feature) => void;
  navigation: any;
  route: RouteProp<any, any>;
}

interface State {
  followUser: boolean;
  followUserHeading: boolean;
  hazard?: Feature;
  userLocationSourceStyle?: Object;
  location?: ProximiioLocation;
  mapLoaded: boolean;
  mapLevel: number;
  route?: ProximiioMapboxRoute;
  routeUpdate?: ProximiioRouteEvent;
  segment?: Feature;
  started: Boolean;
  userLevel: number;
}

const routeEndedEventTypes = [
  ProximiioRouteUpdateType.ROUTE_NOT_FOUND,
  ProximiioRouteUpdateType.ROUTE_OSRM_NETWORK_ERROR,
  ProximiioRouteUpdateType.CANCELED,
  ProximiioRouteUpdateType.FINISHED,
];

const cameraAnimationDuration = 250;

const userLocationSourceStyleOverride = {
  heading: {iconSize: 1.8},
  outerRing: {circleRadius: 24},
  middleRing: {circleRadius: 23},
  innerRing: {circleColor: '#ff0000', circleRadius: 15},
};
const userLocationSourceStyleNoOverride = {
  heading: {},
  outerRing: {},
  middleRing: {},
  innerRing: {},
};

export default class MapScreen extends React.Component<Props, State> {
  private map: MapboxGL.MapView | null = null;
  private camera: MapboxGL.Camera | null = null;
  state = {
    followUser: true,
    followUserHeading: false,
    hazard: undefined,
    userLocationSourceStyle: userLocationSourceStyleNoOverride,
    location: undefined,
    mapLoaded: false,
    mapLevel: 0,
    route: undefined,
    routeUpdate: undefined,
    segment: undefined,
    started: false,
    userLevel: 0,
  };

  componentDidMount() {
    this.onFloorChange(Proximiio.floor);
    this.onPositionUpdate(Proximiio.location);
    Proximiio.subscribe(ProximiioEvents.PositionUpdated, this.onPositionUpdate);
    Proximiio.subscribe(ProximiioEvents.FloorChanged, this.onFloorChange);
    ProximiioMapbox.subscribe(ProximiioMapboxEvents.ROUTE, this.onRoute);
    ProximiioMapbox.subscribe(ProximiioMapboxEvents.ROUTE_UPDATE, this.onRouteUpdate);
    ProximiioMapbox.subscribe(ProximiioMapboxEvents.ON_HAZARD, this.onHazard);
    ProximiioMapbox.subscribe(ProximiioMapboxEvents.ON_SEGMENT, this.onSegment);
    BackHandler.addEventListener('hardwareBackPress', this.onBackPress);
  }

  componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>, snapshot?: any) {
    if (this.props.route.params && this.props.route.params.feature) {
      const feature = this.props.route.params.feature;
      PreferenceHelper.routeFindWithPreferences(feature.id);
      // clear params
      this.props.navigation.setParams({feature: undefined});
    }
  }

  componentWillUnmount() {
    Proximiio.unsubscribe(ProximiioEvents.PositionUpdated, this.onPositionUpdate);
    Proximiio.unsubscribe(ProximiioEvents.FloorChanged, this.onFloorChange);
    ProximiioMapbox.unsubscribe(ProximiioMapboxEvents.ROUTE, this.onRoute);
    ProximiioMapbox.unsubscribe(ProximiioMapboxEvents.ROUTE_UPDATE, this.onRouteUpdate);
    ProximiioMapbox.unsubscribe(ProximiioMapboxEvents.ON_HAZARD, this.onHazard);
    ProximiioMapbox.unsubscribe(ProximiioMapboxEvents.ON_SEGMENT, this.onSegment);
    BackHandler.removeEventListener('hardwareBackPress', this.onBackPress);
  }

  render() {
    return (
      <View style={styles.container}>
        {this.renderMap()}
        {this.renderSearch()}
        <View style={styles.controlsWrapper}>
          {this.renderFloorSelector()}
          <FAB
            color={this.state.followUserHeading ? Colors.primary : Colors.gray}
            icon="compass"
            style={styles.fab}
            onPress={() => this.toggleFollowUserHeading()}
          />
          <FAB
            color={Colors.primary}
            icon="crosshairs-gps"
            style={styles.fab}
            onPress={() => this.showAndFollowCurrentUserLocation()}
          />
        </View>
        <View style={styles.overlaysWrapper}>
          {this.renderRoutePreview()}
          {this.renderCategories()}
          {this.renderRouteCalculation()}
          {this.renderRouteEnded()}
          {this.renderNavigation()}
        </View>
      </View>
    );
  }

  private renderMap() {
    return (
      <MapboxGL.MapView
        ref={(map) => (this.map = map)}
        style={StyleSheet.absoluteFillObject}
        scrollEnabled={true}
        compassEnabled={false}
        styleURL={ProximiioMapbox.styleURL}
        onRegionWillChange={this.onRegionWillChange}
        onDidFinishLoadingMap={() => this.setState({mapLoaded: true})}>
        <MapboxGL.Camera
          ref={(camera) => {
            this.camera = camera;
          }}
          minZoomLevel={1}
          maxZoomLevel={24}
          animationMode={'flyTo'}
          animationDuration={250}
          bounds={MAP_STARTING_BOUNDS}
        />
        {this.state.mapLoaded && (
          <ProximiioContextProvider>
            <AmenitySource />
            <GeoJSONSource
              level={this.state.mapLevel}
              onPress={this.onMapPress}>
              <RoutingSource level={this.state.mapLevel} />
              <UserLocationSource
                showHeadingIndicator={false}
                onAccuracyChanged={(accuracy) => console.log('accuracy: ', accuracy)}
                onHeadingChanged={this.onHeadingChanged}
                visible={this.state.mapLevel === this.state.userLevel}
              />
            </GeoJSONSource>
          </ProximiioContextProvider>
        )}
      </MapboxGL.MapView>
    );
  }

  /**
   * Render UI when route is re/calculating.
   */
  private renderRouteCalculation() {
    if (
      !!this.state.route
      || !this.state.routeUpdate
      || (
        this.state.routeUpdate.eventType !== ProximiioRouteUpdateType.CALCULATING
        && this.state.routeUpdate.eventType !== ProximiioRouteUpdateType.RECALCULATING
      )
    ) {
      return null;
    }
    return (
      <MapCardView style={styles.calculationRow} onClosePressed={() => ProximiioMapbox.route.cancel()}>
        <ActivityIndicator
          size="large"
          color={Colors.primary}
          style={styles.calculationIndicator}
          animating
        />
        <View style={styles.calculationRowText}>
          <Text>{i18n.t('mapscreen.calculating')}</Text>
        </View>
      </MapCardView>
    );
  }

  private renderRouteEnded() {
    if (
      !this.state.routeUpdate ||
      !routeEndedEventTypes.includes(this.state.routeUpdate.eventType)
    ) {
      return null;
    }
    let isFinish = this.state.routeUpdate.eventType === ProximiioRouteUpdateType.FINISHED;
    let icon = isFinish ? require('../../images/direction_icons/finish.png') : require('../../images/direction_icons/canceled.png');
    return (
      <MapCardView style={styles.calculationRow} onClosePressed={this.clearRoute}>
        <Image style={styles.calculationImage} source={icon} />
        <View style={styles.calculationRowText}>
          <Text>{this.state.routeUpdate.text}</Text>
        </View>
      </MapCardView>
    );
  }

  private renderNavigation() {
    if (this.state.started === false || this.state.route == null) {
      return null;
    }
    return (
      <RouteNavigation
        routeUpdate={this.state.routeUpdate}
        hazard={this.state.hazard}
        segment={this.state.segment}
      />
    );
  }

  private renderSearch() {
    if (
      this.state.started === true ||
      this.state.route ||
      this.state.routeUpdate
    ) {
      return null;
    }
    return (
      <View>
        <CardView style={styles.searchCard}>
          <TouchableHighlight
            style={styles.searchCardTouchable}
            activeOpacity={0.9}
            underlayColor="#eeeeee"
            onPress={() => this.openSearch()}>
            <View style={styles.searchCardContent}>
              <Image style={styles.searchIcon} source={require('../../images/ic_search.png')} />
              <Text style={styles.searchText}>
                {i18n.t('common.search_hint')}
              </Text>
            </View>
          </TouchableHighlight>
        </CardView>
      </View>
    );
  }

  private renderRoutePreview() {
    if (this.state.started || !this.state.route) {
      return null;
    }
    console.log(this.state.route);
    return (
      <RoutePreview route={this.state.route} />
    );
  }

  private renderCategories() {
    if (this.state.started || this.state.route || this.state.routeUpdate) {
      return;
    }
    return (
      <View style={styles.searchCategoriesWrapper}>
        <Text style={styles.searchCategoriesLabel}>Explore nearby</Text>
        <FlatList
          style={styles.searchCategories}
          data={categoryList}
          keyExtractor={(item) => item.amenityId}
          horizontal={true}
          renderItem={(renderItem) => this.renderCategoriesItem(renderItem)}
        />
      </View>
    );
  }

  private renderCategoriesItem(renderItem: ListRenderItemInfo<SearchCategory>) {
    return (
      <TouchableOpacity
        onPress={() => this.openSearch(renderItem.item)}
        activeOpacity={0.7}>
        <CardView
          style={{...styles.searchCategoriesItem, backgroundColor: renderItem.item.color}}>
          <Image style={styles.searchCategoriesItemImage} source={renderItem.item.image} />
          <Text style={styles.searchCategoriesItemText}>
            {i18n.t(renderItem.item.title)}
          </Text>
        </CardView>
      </TouchableOpacity>
    );
  }

  private renderFloorSelector() {
    return (
      <FloorPicker
        mapLevel={this.state.mapLevel}
        userLevel={this.state.userLevel}
        onLevelChanged={this.onLevelChanged}
      />
    );
  }

  private openSearch = (searchCategory?: SearchCategory) => {
    console.log('ioebn search', searchCategory);
    this.props.navigation.navigate('SearchScreen', {
      searchCategory: searchCategory,
    });
  };

  /**
   * Find pressed POI on map.
   */
  private onMapPress = (event: Feature[]) => {
    let pois = event.filter((it) => it.properties.type === 'poi');
    if (pois.length > 0) {
      ProximiioMapbox.route.cancel();
      // this.props.onOpenPoi(pois[0]);
      PreferenceHelper.routeFindWithPreferences(pois[0].id);
    }
  };

  /**
   * Update map when user posiiton is updated.
   */
  private onPositionUpdate = async (location: ProximiioLocation) => {
    console.log('location updated: ', location, this.state.location);
    if (!location) {
      return;
    }
    let firstLocationUpdate = this.state.location == null;
    let followUser = this.state.followUser;
    let overrideUserLocationMarkerStyle = location.sourceType === 'native';
    let stateUpdate = {
      location: location,
      userLocationSourceStyle: overrideUserLocationMarkerStyle ? userLocationSourceStyleOverride : userLocationSourceStyleNoOverride,
    };
    let currentZoom = await this.map.getZoom();
    this.setState(stateUpdate);
    if (followUser || firstLocationUpdate) {
      this.camera?.setCamera({
        centerCoordinate: [location.lng, location.lat],
        animationDuration: cameraAnimationDuration,
        animationMode: 'flyTo',
        zoomLevel: firstLocationUpdate
          ? Math.max(currentZoom, 18)
          : currentZoom,
      });
    }
  };

  private onHeadingChanged = (heading: number) => {
    if (this.state.followUserHeading) {
      this.camera?.setCamera({
        heading: heading,
        animationDuration: cameraAnimationDuration,
      });
    }
  };

  private toggleFollowUserHeading = () => {
    let willFollowUserHeading = !this.state.followUserHeading;
    let newState;
    if (willFollowUserHeading) {
      newState = {
        followUser: true,
        followUserHeading: true,
      };
    } else {
      newState = {followUserHeading: false};
      this.onHeadingChanged(0);
    }
    this.setState(newState);
  };

  /**
   * Override back press behaviour when navigation to just cancel navigation and not go out of map.
   */
  private onBackPress = () => {
    if (this.state.route || this.state.routeUpdate) {
      if (routeEndedEventTypes.includes(this.state.routeUpdate.eventType)) {
        this.clearRoute();
      } else {
        ProximiioMapbox.route.cancel();
      }
      return true;
    } else {
      return false;
    }
  };

  /**
   * Listener for route object for navigation.
   * @param event
   */
  private onRoute = (event: ProximiioMapboxRoute) => {
    this.setState({route: event});
  };

  /**
   * Listener for route updates during navigation.
   * @param event
   */
  private onRouteUpdate = (event: ProximiioRouteEvent) => {
    if (
      event.eventType === ProximiioRouteUpdateType.FINISHED ||
      event.eventType === ProximiioRouteUpdateType.CANCELED ||
      event.eventType === ProximiioRouteUpdateType.ROUTE_NOT_FOUND ||
      event.eventType === ProximiioRouteUpdateType.ROUTE_OSRM_NETWORK_ERROR
    ) {
      this.setState({route: null, routeUpdate: event, started: false});
    } else {
      if (event.eventType === ProximiioRouteUpdateType.CALCULATING) {
        this.showAndFollowCurrentUserLocation();
        this.setState({routeUpdate: event, started: false, route: null});
      } else {
        this.setState({routeUpdate: event, started: true});
      }
    }
  };

  private clearRoute = () => {
    this.setState({
      route: null,
      routeUpdate: null,
      started: false,
    });
  };

  /**
   * Listener for floor change. Switches map level if map level is the same as user level currently.
   * @param floor
   */
  private onFloorChange = (floor: ProximiioFloor) => {
    let newUserLevel = floor ? floor.level || 0 : 0;
    let newState;
    if (this.state.userLevel === this.state.mapLevel) {
      newState = {
        mapLevel: newUserLevel,
        userLevel: newUserLevel,
      };
    } else {
      newState = {
        userLevel: newUserLevel,
      };
    }
    this.setState(newState);
  };

  /**
   * Listener on user interacting with map, to prevent moving map camera when user is panning by himself.
   * @param event
   * @private
   */
  private onRegionWillChange = (event) => {
    if (this.state.followUser && event.properties.isUserInteraction === true) {
      console.log('rotating?');
      this.setState({
        followUser: false,
        followUserHeading: false,
      });
    }
  };

  /**
   * Listener for hazard feature warning for navigation.
   * @param hazard
   * @private
   */
  private onHazard = (hazard: ProximiioFeatureType) => {
    this.setState({hazard: new Feature(hazard)});
  };

  /**
   * Listener for segment feature warning for navigation.
   * @param event
   * @private
   */
  private onSegment = (event) => {
    if (event.type === 'enter') {
      this.setState({segment: new Feature(event.segment)});
    } else {
      this.setState({segment: undefined});
    }
  };

  /**
   *Listener for user level change.
   * @param newLevel
   * @private
   */
  private onLevelChanged = (newLevel) => {
    this.setState({mapLevel: newLevel});
  };

  /**
   * Zooms map in.
   * @private
   */
  private zoomIn() {
    this.map.getZoom().then((zoom) => {
      this.camera.zoomTo(zoom + 1, cameraAnimationDuration);
    });
  }

  /**
   * Zooms map out.
   * @private
   */
  private zoomOut() {
    this.map.getZoom().then((zoom) => {
      this.camera.zoomTo(zoom - 1, cameraAnimationDuration);
    });
  }

  /**
   * If known, moves the map camera to current user location and level.
   * @returns {Promise<void>}
   * @private
   */
  private async showAndFollowCurrentUserLocation() {
    if (!this.state.location) {
      return;
    }
    this.setState({
      followUser: true,
      mapLevel: this.state.userLevel,
    });
    let currentZoom = await this.map.getZoom();
    let newZoom = Math.max(currentZoom, 18);
    console.log('zoom:', currentZoom, newZoom);
    this.camera.setCamera({
      centerCoordinate: [this.state.location.lng, this.state.location.lat],
      zoomLevel: newZoom,
      animationDuration: cameraAnimationDuration,
    });
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  controlsWrapper: {
    alignItems: 'flex-end',
    flex: 0,
    flexDirection: 'column',
    width: 'auto',
  },
  overlaysWrapper: {
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    position: 'absolute',
    justifyContent: 'flex-end',
  },
  fab: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchCard: {
    borderRadius: 48,
    marginTop: 16,
    marginHorizontal: 16,
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  searchCardTouchable: {
    borderRadius: 48,
  },
  searchCardContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    paddingHorizontal: 8,
    width: 24,
    height: 24,
  },
  searchText: {
    color: Colors.gray,
  },
  searchCategoriesWrapper: {
    bottom: 0,
    end: 0,
    height: 'auto',
    paddingTop: 8,
    position: 'absolute',
    start: 0,
    top: 'auto',
  },
  searchCategoriesLabel: {
    color: 'white',
    fontSize: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 5,
  },
  searchCategories: {
    paddingVertical: 4,
  },
  searchCategoriesItem: {
    alignItems: 'center',
    backgroundColor: '#eeaaaa',
    borderRadius: 48,
    flexDirection: 'row',
    margin: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchCategoriesItemImage: {
    height: 24,
    marginEnd: 4,
    width: 24,
    tintColor: Colors.white,
  },
  searchCategoriesItemText: {
    color: 'white',
    fontSize: 14,
  },
  calculationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    alignContent: 'center',
    justifyContent: 'space-around',
  },
  calculationIndicator: {
    padding: 8,
    height: 24,
    width: 24,
  },
  calculationImage: {
    padding: 0,
    height: 32,
    width: 32,
  },
  calculationRowText: {
    flex: 1,
    padding: 8,
    marginStart: 4,
    alignItems: 'flex-start',
  },
  calculationRowCancel: {
    height: 32,
    tintColor: Colors.black,
    width: 32,
  },
});
