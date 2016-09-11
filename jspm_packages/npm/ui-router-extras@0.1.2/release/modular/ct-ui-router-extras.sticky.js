/* */ 
(function(process) {
  (function(angular, undefined) {
    "use strict";
    angular.module("ct.ui.router.extras.sticky", ['ct.ui.router.extras.core']);
    var mod_sticky = angular.module("ct.ui.router.extras.sticky");
    $StickyStateProvider.$inject = ['$stateProvider', 'uirextras_coreProvider'];
    function $StickyStateProvider($stateProvider, uirextras_coreProvider) {
      var core = uirextras_coreProvider;
      var inheritParams = core.inheritParams;
      var objectKeys = core.objectKeys;
      var protoKeys = core.protoKeys;
      var forEach = core.forEach;
      var map = core.map;
      var inactiveStates = {};
      var stickyStates = {};
      var $state;
      var DEBUG = false;
      this.registerStickyState = function(state) {
        stickyStates[state.name] = state;
      };
      this.enableDebug = this.debugMode = function(enabled) {
        if (angular.isDefined(enabled))
          DEBUG = enabled;
        return DEBUG;
      };
      this.$get = ['$rootScope', '$state', '$stateParams', '$injector', '$log', function($rootScope, $state, $stateParams, $injector, $log) {
        function mapInactives() {
          var mappedStates = {};
          angular.forEach(inactiveStates, function(state, name) {
            var stickyAncestors = getStickyStateStack(state);
            for (var i = 0; i < stickyAncestors.length; i++) {
              var parent = stickyAncestors[i].parent;
              mappedStates[parent.name] = mappedStates[parent.name] || [];
              mappedStates[parent.name].push(state);
            }
            if (mappedStates['']) {
              mappedStates['__inactives'] = mappedStates[''];
            }
          });
          return mappedStates;
        }
        function mapInactivesByImmediateParent() {
          var inactivesByAllParents = {};
          forEach(inactiveStates, function(state) {
            forEach(state.path, function(ancestor) {
              if (ancestor === state)
                return;
              inactivesByAllParents[ancestor.name] = inactivesByAllParents[ancestor.name] || [];
              inactivesByAllParents[ancestor.name].push(state);
            });
          });
          return inactivesByAllParents;
        }
        function getStickyStateStack(state) {
          var stack = [];
          if (!state)
            return stack;
          do {
            if (state.sticky)
              stack.push(state);
            state = state.parent;
          } while (state);
          stack.reverse();
          return stack;
        }
        function getEnterTransition(state, stateParams, reloadStateTree, ancestorReloaded) {
          if (ancestorReloaded)
            return "reload";
          var inactiveState = inactiveStates[state.self.name];
          if (!inactiveState)
            return "enter";
          if (state.self === reloadStateTree)
            return "reload";
          var paramsMatch = paramsEqualForState(state.ownParams, stateParams, inactiveState.locals.globals.$stateParams);
          return paramsMatch ? "reactivate" : "reload";
        }
        function getInactivatedState(state, stateParams) {
          var inactiveState = inactiveStates[state.name];
          if (!inactiveState)
            return null;
          if (!stateParams)
            return inactiveState;
          var paramsMatch = paramsEqualForState(state.ownParams, stateParams, inactiveState.locals.globals.$stateParams);
          return paramsMatch ? inactiveState : null;
        }
        function paramsEqualForState(ownParams, stateParams, stateParams2) {
          if (typeof ownParams.$$equals === 'function')
            return ownParams.$$equals(stateParams, stateParams2);
          return equalForKeys(stateParams, stateParams2, ownParams);
        }
        function equalForKeys(a, b, keys) {
          if (!angular.isArray(keys) && angular.isObject(keys)) {
            keys = protoKeys(keys, ["$$keys", "$$values", "$$equals", "$$validates", "$$new", "$$parent"]);
          }
          if (!keys) {
            keys = [];
            for (var n in a)
              keys.push(n);
          }
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (a[k] != b[k])
              return false;
          }
          return true;
        }
        function calcTreeChanges(transition) {
          var fromPath = transition.fromState.path;
          var toPath = transition.toState.path;
          var toParams = transition.toParams;
          var keep = 0,
              state = toPath[keep];
          if (transition.options && transition.options.inherit) {
            toParams = transition.toParams = inheritParams($stateParams, toParams || {}, $state.$current, transition.toState);
          }
          while (state && state === fromPath[keep] && paramsEqualForState(state.ownParams, toParams, transition.fromParams)) {
            state = toPath[++keep];
          }
          return {
            keep: keep,
            retained: fromPath.slice(0, keep),
            exiting: fromPath.slice(keep),
            entering: toPath.slice(keep)
          };
        }
        var stickySupport = {
          getInactiveStates: function() {
            return map(inactiveStates, angular.identity);
          },
          getInactiveStatesByParent: function() {
            return mapInactives();
          },
          processTransition: function(transition) {
            var treeChanges = calcTreeChanges(transition);
            var currentInactives = map(inactiveStates, angular.identity);
            var futureInactives,
                exitingTypes,
                enteringTypes;
            var keep = treeChanges.keep;
            function notIn(array) {
              return function(elem) {
                return array.indexOf(elem) === -1;
              };
            }
            function flattenReduce(memo, list) {
              return memo.concat(list);
            }
            function uniqReduce(memo, orphan) {
              if (notIn(memo)(orphan))
                memo.push(orphan);
              return memo;
            }
            function prop(attr) {
              return function(obj) {
                return obj[attr];
              };
            }
            function typeIs(type) {
              return function(obj) {
                return obj.type === type;
              };
            }
            function isChildOf(state) {
              return function(other) {
                return other.parent === state;
              };
            }
            var notEntering = notIn(treeChanges.entering);
            function notSticky(state) {
              return !state.sticky;
            }
            var shouldInactivate = treeChanges.exiting[0] && treeChanges.exiting[0].sticky && treeChanges.entering.length > 0;
            exitingTypes = treeChanges.exiting.map(function(state) {
              var stateRentering = treeChanges.entering.indexOf(state) !== -1;
              var type = shouldInactivate && !stateRentering ? "inactivate" : "exit";
              return {
                type: type,
                state: state
              };
            });
            var reloaded = transition.options && !!transition.options.reload;
            enteringTypes = treeChanges.entering.map(function(state) {
              var type = getEnterTransition(state, transition.toParams, transition.reloadStateTree, reloaded);
              reloaded = reloaded || type === 'reload';
              return {
                type: type,
                state: state
              };
            });
            var orphanedRoots = treeChanges.entering.map(function(entering) {
              return currentInactives.filter(isChildOf(entering.parent));
            }).reduce(flattenReduce, []).filter(notEntering).filter(notSticky).concat(currentInactives.filter(isChildOf(transition.toState)));
            var currentInactivesByParent = mapInactivesByImmediateParent();
            var allOrphans = orphanedRoots.map(function(root) {
              return currentInactivesByParent[root.name];
            }).filter(angular.isDefined).reduce(flattenReduce, []).concat(orphanedRoots).sort(function(a, b) {
              return a.name.split(".").length - b.name.split(".").length;
            });
            var exitOrOrphaned = exitingTypes.filter(typeIs("exit")).map(prop("state")).concat(allOrphans);
            futureInactives = currentInactives.filter(notIn(exitOrOrphaned)).filter(notIn(treeChanges.entering)).concat(exitingTypes.filter(typeIs("inactivate")).map(prop("state")));
            return {
              keep: keep,
              enter: new Array(keep).concat(enteringTypes.map(prop("type"))),
              exit: new Array(keep).concat(exitingTypes.map(prop("type"))),
              inactives: futureInactives,
              reactivatingStates: enteringTypes.filter(typeIs("reactivate")).map(prop("state")),
              orphans: allOrphans
            };
          },
          stateInactivated: function(state) {
            inactiveStates[state.self.name] = state;
            state.self.status = 'inactive';
            if (state.self.onInactivate)
              $injector.invoke(state.self.onInactivate, state.self, state.locals.globals);
          },
          stateReactivated: function(state) {
            if (inactiveStates[state.self.name]) {
              delete inactiveStates[state.self.name];
            }
            state.self.status = 'entered';
            if (state.self.onReactivate)
              $injector.invoke(state.self.onReactivate, state.self, state.locals.globals);
          },
          stateExiting: function(exiting, exitQueue, onExit) {
            var exitingNames = {};
            angular.forEach(exitQueue, function(state) {
              exitingNames[state.self.name] = true;
            });
            angular.forEach(inactiveStates, function(inactiveExiting, name) {
              if (!exitingNames[name] && inactiveExiting.includes[exiting.name]) {
                if (DEBUG)
                  $log.debug("Exiting " + name + " because it's a substate of " + exiting.name + " and wasn't found in ", exitingNames);
                if (inactiveExiting.self.onExit)
                  $injector.invoke(inactiveExiting.self.onExit, inactiveExiting.self, inactiveExiting.locals.globals);
                angular.forEach(inactiveExiting.locals, function(localval, key) {
                  delete inactivePseudoState.locals[key];
                });
                inactiveExiting.locals = null;
                inactiveExiting.self.status = 'exited';
                delete inactiveStates[name];
              }
            });
            if (onExit)
              $injector.invoke(onExit, exiting.self, exiting.locals.globals);
            exiting.locals = null;
            exiting.self.status = 'exited';
            delete inactiveStates[exiting.self.name];
          },
          stateEntering: function(entering, params, onEnter, updateParams) {
            var inactivatedState = getInactivatedState(entering);
            if (inactivatedState && (updateParams || !getInactivatedState(entering, params))) {
              var savedLocals = entering.locals;
              this.stateExiting(inactivatedState);
              entering.locals = savedLocals;
            }
            entering.self.status = 'entered';
            if (onEnter)
              $injector.invoke(onEnter, entering.self, entering.locals.globals);
          },
          reset: function reset(inactiveState, params) {
            function resetOne(state) {
              stickySupport.reset(state);
            }
            if (inactiveState === "*") {
              angular.forEach(stickySupport.getInactiveStates(), resetOne);
              return true;
            }
            var state = $state.get(inactiveState);
            if (!state)
              return false;
            var exiting = getInactivatedState(state, params);
            if (!exiting)
              return false;
            stickySupport.stateExiting(exiting);
            $rootScope.$broadcast("$viewContentLoading");
            return true;
          }
        };
        return stickySupport;
      }];
    }
    mod_sticky.provider("$stickyState", $StickyStateProvider);
    var _StickyState;
    var internalStates = {};
    var root,
        pendingTransitions = [],
        pendingRestore,
        inactivePseudoState,
        reactivatingLocals = {},
        versionHeuristics = {hasParamSet: false};
    function SurrogateState(type) {
      return {
        resolve: {},
        locals: {globals: root && root.locals && root.locals.globals},
        views: {},
        self: {},
        params: {},
        ownParams: (versionHeuristics.hasParamSet ? {$$equals: function() {
            return true;
          }} : []),
        surrogateType: type
      };
    }
    angular.module("ct.ui.router.extras.sticky").run(["$stickyState", function($stickyState) {
      _StickyState = $stickyState;
    }]);
    angular.module("ct.ui.router.extras.sticky").config(["$provide", "$stateProvider", '$stickyStateProvider', '$urlMatcherFactoryProvider', 'uirextras_coreProvider', function($provide, $stateProvider, $stickyStateProvider, $urlMatcherFactoryProvider, uirextras_coreProvider) {
      var core = uirextras_coreProvider;
      var internalStates = core.internalStates;
      var inherit = core.inherit;
      var inheritParams = core.inheritParams;
      var forEach = core.forEach;
      var map = core.map;
      var filterObj = core.filterObj;
      versionHeuristics.hasParamSet = !!$urlMatcherFactoryProvider.ParamSet;
      inactivePseudoState = angular.extend(new SurrogateState("__inactives"), {self: {name: '__inactives'}});
      root = pendingRestore = undefined;
      pendingTransitions = [];
      uirextras_coreProvider.onStateRegistered(function(state) {
        if (state.self.sticky === true) {
          $stickyStateProvider.registerStickyState(state.self);
        }
      });
      var $state_transitionTo;
      $provide.decorator("$state", ['$delegate', '$log', '$q', function($state, $log, $q) {
        root = $state.$current;
        internalStates[""] = root;
        root.parent = inactivePseudoState;
        inactivePseudoState.parent = undefined;
        inactivePseudoState.locals = inherit(reactivatingLocals, inactivePseudoState.locals);
        root.locals = inherit(inactivePseudoState.locals, root.locals);
        delete inactivePseudoState.locals.globals;
        $state_transitionTo = $state.transitionTo;
        $state.transitionTo = function(to, toParams, options) {
          var DEBUG = $stickyStateProvider.debugMode();
          if (!inactivePseudoState.locals)
            inactivePseudoState.locals = root.locals;
          var idx = pendingTransitions.length;
          if (pendingRestore) {
            pendingRestore();
            if (DEBUG) {
              $log.debug("Restored paths from pending transition");
            }
          }
          var fromState = $state.$current,
              fromParams = $state.params;
          var rel = options && options.relative || $state.$current;
          var toStateSelf = $state.get(to, rel);
          var savedToStatePath,
              savedFromStatePath,
              stickyTransitions;
          var reactivated = [],
              exited = [],
              terminalReactivatedState;
          toParams = toParams || {};
          arguments[1] = toParams;
          var noop = function() {};
          var restore = function() {
            if (savedToStatePath) {
              toState.path = savedToStatePath;
              savedToStatePath = null;
            }
            if (savedFromStatePath) {
              fromState.path = savedFromStatePath;
              savedFromStatePath = null;
            }
            angular.forEach(restore.restoreFunctions, function(restoreFunction) {
              restoreFunction();
            });
            restore = noop;
            pendingRestore = null;
            pendingTransitions.splice(idx, 1);
          };
          restore.restoreFunctions = [];
          restore.addRestoreFunction = function addRestoreFunction(fn) {
            this.restoreFunctions.push(fn);
          };
          function stateReactivatedSurrogatePhase1(state) {
            var surrogate = angular.extend(new SurrogateState("reactivate_phase1"), {locals: state.locals});
            surrogate.self = angular.extend({}, state.self);
            return surrogate;
          }
          function stateReactivatedSurrogatePhase2(state) {
            var surrogate = angular.extend(new SurrogateState("reactivate_phase2"), state);
            var oldOnEnter = surrogate.self.onEnter;
            surrogate.resolve = {};
            surrogate.views = {};
            surrogate.self.onEnter = function() {
              surrogate.locals = state.locals;
              _StickyState.stateReactivated(state);
            };
            restore.addRestoreFunction(function() {
              state.self.onEnter = oldOnEnter;
            });
            return surrogate;
          }
          function stateInactivatedSurrogate(state) {
            var surrogate = new SurrogateState("inactivate");
            surrogate.self = state.self;
            var oldOnExit = state.self.onExit;
            surrogate.self.onExit = function() {
              _StickyState.stateInactivated(state);
            };
            restore.addRestoreFunction(function() {
              state.self.onExit = oldOnExit;
            });
            return surrogate;
          }
          function stateEnteredSurrogate(state, toParams) {
            var oldOnEnter = state.self.onEnter;
            state.self.onEnter = function() {
              _StickyState.stateEntering(state, toParams, oldOnEnter);
            };
            restore.addRestoreFunction(function() {
              state.self.onEnter = oldOnEnter;
            });
            return state;
          }
          function stateUpdateParamsSurrogate(state, toParams) {
            var oldOnEnter = state.self.onEnter;
            state.self.onEnter = function() {
              _StickyState.stateEntering(state, toParams, oldOnEnter, true);
            };
            restore.addRestoreFunction(function() {
              state.self.onEnter = oldOnEnter;
            });
            return state;
          }
          function stateExitedSurrogate(state) {
            var oldOnExit = state.self.onExit;
            state.self.onExit = function() {
              _StickyState.stateExiting(state, exited, oldOnExit);
            };
            restore.addRestoreFunction(function() {
              state.self.onExit = oldOnExit;
            });
            return state;
          }
          if (toStateSelf) {
            var toState = internalStates[toStateSelf.name];
            if (toState) {
              savedToStatePath = toState.path;
              savedFromStatePath = fromState.path;
              var reload = options && options.reload || false;
              var reloadStateTree = reload && (reload === true ? savedToStatePath[0].self : $state.get(reload, rel));
              if (options && reload && reload !== true)
                delete options.reload;
              var currentTransition = {
                toState: toState,
                toParams: toParams || {},
                fromState: fromState,
                fromParams: fromParams || {},
                options: options,
                reloadStateTree: reloadStateTree
              };
              pendingTransitions.push(currentTransition);
              pendingRestore = restore;
              if (reloadStateTree) {
                currentTransition.toParams.$$uirouterextrasreload = Math.random();
                var params = reloadStateTree.$$state().params;
                var ownParams = reloadStateTree.$$state().ownParams;
                if (versionHeuristics.hasParamSet) {
                  var tempParam = new $urlMatcherFactoryProvider.Param('$$uirouterextrasreload');
                  params.$$uirouterextrasreload = ownParams.$$uirouterextrasreload = tempParam;
                  restore.restoreFunctions.push(function() {
                    delete params.$$uirouterextrasreload;
                    delete ownParams.$$uirouterextrasreload;
                  });
                } else {
                  params.push('$$uirouterextrasreload');
                  ownParams.push('$$uirouterextrasreload');
                  restore.restoreFunctions.push(function() {
                    params.length = params.length - 1;
                    ownParams.length = ownParams.length - 1;
                  });
                }
              }
              stickyTransitions = _StickyState.processTransition(currentTransition);
              if (DEBUG)
                debugTransition($log, currentTransition, stickyTransitions);
              var surrogateToPath = toState.path.slice(0, stickyTransitions.keep);
              var surrogateFromPath = fromState.path.slice(0, stickyTransitions.keep);
              angular.forEach(inactivePseudoState.locals, function(local, name) {
                if (name.indexOf("@") != -1)
                  delete inactivePseudoState.locals[name];
              });
              var saveViewsToLocals = function(targetObj) {
                return function(view, name) {
                  if (name.indexOf("@") !== -1) {
                    targetObj[name] = view;
                  }
                };
              };
              forEach(stickyTransitions.inactives, function(state) {
                forEach(state.locals, saveViewsToLocals(inactivePseudoState.locals));
              });
              forEach(stickyTransitions.reactivatingStates, function(state) {
                forEach(state.locals, saveViewsToLocals(reactivatingLocals));
              });
              restore.addRestoreFunction(function clearReactivatingLocals() {
                forEach(reactivatingLocals, function(val, viewname) {
                  delete reactivatingLocals[viewname];
                });
              });
              angular.forEach(stickyTransitions.enter, function(value, idx) {
                var surrogate;
                var enteringState = toState.path[idx];
                if (value === "reactivate") {
                  surrogate = stateReactivatedSurrogatePhase1(enteringState);
                  surrogateToPath.push(surrogate);
                  surrogateFromPath.push(surrogate);
                  reactivated.push(stateReactivatedSurrogatePhase2(enteringState));
                  terminalReactivatedState = enteringState;
                } else if (value === "reload") {
                  surrogateToPath.push(stateUpdateParamsSurrogate(enteringState));
                  terminalReactivatedState = enteringState;
                } else if (value === "enter") {
                  surrogateToPath.push(stateEnteredSurrogate(enteringState));
                }
              });
              angular.forEach(stickyTransitions.exit, function(value, idx) {
                var exiting = fromState.path[idx];
                if (value === "inactivate") {
                  surrogateFromPath.push(stateInactivatedSurrogate(exiting));
                  exited.push(exiting);
                } else if (value === "exit") {
                  surrogateFromPath.push(stateExitedSurrogate(exiting));
                  exited.push(exiting);
                }
              });
              if (reactivated.length) {
                angular.forEach(reactivated, function(surrogate) {
                  surrogateToPath.push(surrogate);
                });
              }
              var orphans = stickyTransitions.orphans;
              surrogateFromPath = surrogateFromPath.concat(map(orphans, function(exiting) {
                return stateExitedSurrogate(exiting);
              }));
              exited = exited.concat(orphans);
              fromState.path = surrogateFromPath;
              toState.path = surrogateToPath;
              var pathMessage = function(state) {
                return (state.surrogateType ? state.surrogateType + ":" : "") + state.self.name;
              };
              if (DEBUG)
                $log.debug("SurrogateFromPath: ", map(surrogateFromPath, pathMessage));
              if (DEBUG)
                $log.debug("SurrogateToPath:   ", map(surrogateToPath, pathMessage));
            }
          }
          var transitionPromise = $state_transitionTo.apply($state, arguments);
          return transitionPromise.then(function transitionSuccess(state) {
            restore();
            if (DEBUG)
              debugViewsAfterSuccess($log, internalStates[state.name], $state);
            state.status = 'active';
            return state;
          }, function transitionFailed(err) {
            restore();
            if (DEBUG && err.message !== "transition prevented" && err.message !== "transition aborted" && err.message !== "transition superseded") {
              $log.debug("transition failed", err);
              $log.debug(err.stack);
            }
            return $q.reject(err);
          });
        };
        return $state;
      }]);
      function debugTransition($log, currentTransition, stickyTransition) {
        function message(path, index, state) {
          return (path[index] ? path[index].toUpperCase() + ": " + state.self.name : "(" + state.self.name + ")");
        }
        var inactiveLogVar = map(stickyTransition.inactives, function(state) {
          return state.self.name;
        });
        var enterLogVar = map(currentTransition.toState.path, function(state, index) {
          return message(stickyTransition.enter, index, state);
        });
        var exitLogVar = map(currentTransition.fromState.path, function(state, index) {
          return message(stickyTransition.exit, index, state);
        });
        var transitionMessage = currentTransition.fromState.self.name + ": " + angular.toJson(currentTransition.fromParams) + ": " + " -> " + currentTransition.toState.self.name + ": " + angular.toJson(currentTransition.toParams);
        $log.debug("------------------------------------------------------");
        $log.debug("   Current transition: ", transitionMessage);
        $log.debug("Before transition, inactives are:   : ", map(_StickyState.getInactiveStates(), function(s) {
          return s.self.name;
        }));
        $log.debug("After transition,  inactives will be: ", inactiveLogVar);
        $log.debug("Transition will exit:  ", exitLogVar);
        $log.debug("Transition will enter: ", enterLogVar);
      }
      function debugViewsAfterSuccess($log, currentState, $state) {
        $log.debug("Current state: " + currentState.self.name + ", inactive states: ", map(_StickyState.getInactiveStates(), function(s) {
          return s.self.name;
        }));
        var viewMsg = function(local, name) {
          return "'" + name + "' (" + local.$$state.name + ")";
        };
        var statesOnly = function(local, name) {
          return name != 'globals' && name != 'resolve';
        };
        var viewsForState = function(state) {
          var views = map(filterObj(state.locals, statesOnly), viewMsg).join(", ");
          return "(" + (state.self.name ? state.self.name : "root") + ".locals" + (views.length ? ": " + views : "") + ")";
        };
        var message = viewsForState(currentState);
        var parent = currentState.parent;
        while (parent && parent !== currentState) {
          if (parent.self.name === "") {
            message = viewsForState($state.$current.path[0]) + " / " + message;
          }
          message = viewsForState(parent) + " / " + message;
          currentState = parent;
          parent = currentState.parent;
        }
        $log.debug("Views: " + message);
      }
    }]);
  })(angular);
})(require('process'));
