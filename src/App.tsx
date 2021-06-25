import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapboxGL from '@react-native-mapbox-gl/maps';
import Proximiio, {NotificationMode} from 'react-native-proximiio';
import {Colors} from './Style';
import PreferenceHelper from './utils/PreferenceHelper';
import {LEVEL_OVERRIDE_MAP, PROXIMIIO_TOKEN} from './utils/Constants';
import ProximiioMapbox, {
  ProximiioMapboxEvents,
  ProximiioMapboxSyncStatus,
} from 'react-native-proximiio-mapbox';
import i18n from 'i18next';
import {Appbar} from 'react-native-paper';
import MapScreen from './ui/map/MapScreen';
import PreferenceScreen from './ui/preferences/PreferenceScreen';
import SearchScreen from './ui/search/SearchScreen';
import {SearchCategory} from './ui/search/SearchCategories';
import PolicyScreen from "./ui/policy/PolicyScreen";
import {createStackNavigator} from "@react-navigation/stack";
import {NavigationContainer} from "@react-navigation/native";

/**
 * Create UI stack to manage screens.
 */
// const Stack = createStackNavigator();

/**
 * Call necessary to init mapbox.
 */
MapboxGL.setAccessToken('');

/**
 * Create stack for screen navigation
 */
const Stack = createStackNavigator();

/**
 * RNComponent properties
 */
interface Props {}
/**
 * RNComponent state
 */
interface State {
  mapLoaded: Boolean;
  proximiioReady: Boolean;
  showSearch: Boolean;
  showPreferences: Boolean;
  policyAccepted: Boolean;
}

/**
 * Main application class
 */
export default class App extends React.Component<Props, State> {
  state = {
    mapLoaded: false,
    proximiioReady: false,
    showSearch: false,
    showPreferences: false,
    policyAccepted: false,
  };
  private syncListener = undefined;
  private policyAccepted = false;

  componentDidMount() {
    PreferenceHelper.getPrivacyPolicyAccepted().then((accepted) => {
      this.setState({policyAccepted: accepted});
      if (accepted) {
        this.initProximiio();
      }
    });
  }

  componentWillUnmount() {
    // Cancel sync status listener
    this.syncListener?.remove();
  }

  render() {
    // Wait for preference to be loaded
    if (this.state.policyAccepted === undefined) {
      this.renderLoadingOverlay();
    }
    // Preference loaded, policy not accepted
    if (this.state.policyAccepted === false) {
      return this.renderPolicyScreen();
    }
    // Init proximi.io libs
    if (!this.state.proximiioReady) {
      return this.renderLoadingOverlay();
    }
    // Render main app content
    return this.renderScreenStack();
  }

  private renderLoadingOverlay() {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator
          size="large"
          color={Colors.primary}
          style={{marginBottom: 8}}
          animating
        />
        <Text>{i18n.t('app.loading')}</Text>
      </View>
    );
  }

  private renderPolicyScreen() {
    return (
      <SafeAreaView style={{flex: 1}}>
        <PolicyScreen onPolicyAccepted={this.onPolicyAccepted} />
      </SafeAreaView>
    );
  }

  private renderScreenStack() {
    return (
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="MapScreen"
            component={MapScreen}
            options={({navigation}) => {
              return {
                title: i18n.t('app.title_map'),
                headerRight: (tintColor) =>
                  this.getSettingsButton(tintColor, navigation),
              };
            }}
          />
          <Stack.Screen
            name="SearchScreen"
            component={SearchScreen}
            options={{title: i18n.t('app.title_search')}}
          />
          <Stack.Screen
            name="PreferenceScreen"
            component={PreferenceScreen}
            options={{title: i18n.t('app.title_settings')}}
          />
        </Stack.Navigator>
      </NavigationContainer>
      // <NavigationContainer>
      //   <Stack.Navigator>
      //     {/*<Stack.Screen*/}
      //     {/*  name="PolicyScreen"*/}
      //     {/*  component={PolicyScreen}*/}
      //     {/*  initialParams={{onPolicyAccepted: this.onPolicyAccepted}}*/}
      //     {/*/>*/}
      //     <Stack.Screen name="MapScreen" component={MapScreen} />
      //     <Stack.Screen name="PreferenceScreen" component={PreferenceScreen} />
      //     {/*<Stack.Screen name="AboutScreen" component={AboutScreen} />*/}
      //   </Stack.Navigator>
      // </NavigationContainer>
    );
  }

  private onPolicyAccepted = () => {
    console.log('privacy policy accepted');
    this.setState({policyAccepted: true});
    PreferenceHelper.setPrivacyPolicyAccepted();
    this.initProximiio();
  };

  /**
   * Create appbar settings button.
   * @param tintColor
   * @param navigation
   * @returns {JSX.Element}
   * @private
   */
  private getSettingsButton(tintColor, navigation) {
    return (
      <TouchableOpacity
        style={styles.appbarButton}
        onPress={() => navigation.navigate('PreferenceScreen')}
        activeOpacity={0.5}>
        <Image
          style={styles.appBarButtonImage}
          source={require('./images/ic_settings.png')}
        />
      </TouchableOpacity>
    );
  }

  /**
   * Initializes Proximi.io location and mapbox libraries.
   */
  private async initProximiio() {
    // Proximi.io mapbox library sync listener
    this.syncListener = ProximiioMapbox.subscribe(
      ProximiioMapboxEvents.SYNC_STATUS,
      (status: ProximiioMapboxSyncStatus) => {
        if (
          status === ProximiioMapboxSyncStatus.INITIAL_ERROR ||
          status === ProximiioMapboxSyncStatus.INITIAL_NETWORK_ERROR
        ) {
          setTimeout(() => {
            ProximiioMapbox.startSyncNow();
          }, 5000);
        }
      },
    );
    // Authorize libraries with token
    await Proximiio.authorize(PROXIMIIO_TOKEN);
    Proximiio.setPdr(true, 4);
    Proximiio.setSnapToRoute(true, 20);
    Proximiio.setNotificationMode(NotificationMode.Disabled);
    Proximiio.updateOptions();
    await ProximiioMapbox.authorize(PROXIMIIO_TOKEN);
    ProximiioMapbox.setRerouteEnabled(true);
    ProximiioMapbox.setReRouteThreshold(3);
    ProximiioMapbox.setRouteFinishThreshold(2.5);
    ProximiioMapbox.setStepImmediateThreshold(3.5);
    ProximiioMapbox.setStepPreparationThreshold(3.0);
    ProximiioMapbox.setUserLocationToRouteSnappingEnabled(true);
    ProximiioMapbox.setUserLocationToRouteSnappingThreshold(6.0);
    ProximiioMapbox.ttsHeadingCorrectionThresholds(8, 90);
    ProximiioMapbox.setLevelOverrideMap(LEVEL_OVERRIDE_MAP);
    // Apply user preferences, manageable in preference screen
    await PreferenceHelper.applyPreferences();
    // Request permissions needed for localization
    await Proximiio.requestPermissions();
    // When ready, change state to show UI.
    await this.setState({
      proximiioReady: true,
    });
  }
}

const styles = StyleSheet.create({
  appbarButton: {
    marginRight: 8,
  },
  appBarButtonImage: {
    height: 32,
    width: 32,
  },
  loadingOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
