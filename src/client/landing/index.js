//console.log('loading landing app main js...');

import 'angular';
import 'angular-ui-router';
import 'angular-aria';
import 'angular-animate';
import 'angular-messages';
import 'angular-material';
import 'angular-material/angular-material.css!';
import 'angular-material/angular-material.layouts.css!';

import app from 'client/common/incubator/ng-app-bootstrap';

app.global_ng_module_dependencies = ['ui.router', 'ngAria', 'ngAnimate', 'ngMessages', 'ngMaterial'];

// now that global module is ready, load ng modules

window._app.global_ng_module.controller('AppController', ['$scope', function ($scope) {
  //console.info('AppController…');

  // TODO locale
  this.title = window._app.server_title || 'SPA';
}]);

// use more convenient AMD syntax
require([
  'client/landing/lib/ng/components/layout',
  'client/landing/lib/ng/routes/index',
  'client/landing/index.css!',
  'client/common/assets/fonts/material-icons.css!'
], app.bootstrap);
