/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React from 'react';

import {
  assign,
  isFunction
} from 'min-dash';

import classNames from 'classnames';

import { Fill } from '../../slot-fill';

import {
  Loader
} from '../../primitives';

import {
  Button,
  Icon
} from '../../../shared/ui';

import {
  debounce
} from '../../../util';

import configureModeler from './util/configure';

import {
  WithCache,
  WithCachedState,
  CachedComponent
} from '../../cached';

import OverviewContainer from './OverviewContainer';

import PropertiesContainer from '../PropertiesContainer';

import CamundaDmnModeler from './modeler';

import { active as isInputActive } from '../../../util/dom/isInput';

import {
  getDmnDrdEditMenu,
  getDmnDecisionTableEditMenu,
  getDmnLiteralExpressionEditMenu
} from './getDmnEditMenu';

import getDmnWindowMenu from './getDmnWindowMenu';

import css from './DmnEditor.less';

import generateImage from '../../util/generateImage';

import Metadata from '../../../util/Metadata';

import { findUsages as findNamespaceUsages } from '../util/namespace';

import { migrateDiagram } from '@bpmn-io/dmn-migrate';

import { DEFAULT_LAYOUT as propertiesPanelDefaultLayout } from '../PropertiesContainer';

import { DEFAULT_LAYOUT as overviewDefaultLayout } from './OverviewContainer';

import { EngineProfile } from '../EngineProfile';

import { ENGINES } from '../../../util/Engines';

const EXPORT_AS = [ 'png', 'jpeg', 'svg' ];

const NAMESPACE_URL_DMN11 = 'http://www.omg.org/spec/DMN/20151101/dmn.xsd',
      NAMESPACE_URL_DMN12 = 'http://www.omg.org/spec/DMN/20180521/MODEL/';

const CONFIG_KEY = 'editor.askDmnMigration';

export const engineProfile = {
  executionPlatform: ENGINES.PLATFORM
};


export class DmnEditor extends CachedComponent {

  constructor(props) {
    super(props);

    this.state = { };

    this.ref = React.createRef();
    this.overviewRef = React.createRef();
    this.propertiesPanelRef = React.createRef();

    this.handleResize = debounce(this.handleResize);
  }

  componentDidMount() {
    this._isMounted = true;

    const modeler = this.getModeler();

    this.listen('on');

    modeler.attachTo(this.ref.current);

    const activeViewer = modeler.getActiveViewer();

    let propertiesPanel;

    if (activeViewer) {
      propertiesPanel = activeViewer.get('propertiesPanel', false);

      if (propertiesPanel) {
        propertiesPanel.attachTo(this.propertiesPanelRef.current);
      }

      // attach overview
      if (this.overviewRef.current) {
        modeler.attachOverviewTo(this.overviewRef.current);

        if (isOverviewOpen(this.props)) {
          modeler._emit('overviewOpen');
        }
      }
    }

    this.checkImport();
  }

  componentWillUnmount() {
    this._isMounted = false;

    const modeler = this.getModeler();

    this.listen('off');

    modeler.detach();
  }

  componentDidUpdate(prevProps) {
    this.checkImport(prevProps);

    // We can only notify interested parties about overview open once its parent component was
    // rendered
    if (isOverviewOpened(this.props, prevProps)) {
      const modeler = this.getModeler();

      modeler._emit('overviewOpen');
    }

    if (isCachedStateChange(prevProps, this.props)) {
      this.handleChanged();
    }
  }

  ifMounted = (fn) => {
    return (...args) => {
      if (this._isMounted) {
        fn(...args);
      }
    };
  }

  listen(fn) {
    const modeler = this.getModeler();

    [
      'saveXML.done',
      'attach',
      'view.selectionChanged',
      'view.directEditingChanged',
      'propertiesPanel.focusin',
      'propertiesPanel.focusout'
    ].forEach((event) => {
      modeler[fn](event, this.handleChanged);
    });

    modeler[fn]('views.changed', this.viewsChanged);

    modeler[fn]('view.contentChanged', this.viewContentChanged);

    modeler[fn]('error', this.handleError);
  }

  isDirty = () => {
    let {
      dirty,
      modeler,
      stackIdx
    } = this.getCached();

    return dirty || modeler.getStackIdx() !== stackIdx;
  }

  viewContentChanged = () => {
    this.handleChanged();
  }

  handleImport(error, warnings) {
    const {
      activeSheet,
      onImport,
      xml
    } = this.props;

    const modeler = this.getModeler();

    const stackIdx = modeler.getStackIdx();

    onImport(error, warnings);

    if (error) {
      this.setCached({
        dirty: false,
        lastXML: null
      });
    } else {
      this.setCached({
        dirty: false,
        lastXML: xml,
        stackIdx
      });

      this.setState({
        importing: false
      });

      if (activeSheet && activeSheet.element) {
        return this.open(activeSheet.element);
      }

      const initialView = modeler._getInitialView(modeler._views);

      this.open(initialView.element);
    }

  }

  viewsChanged = ({ activeView }) => {
    const {
      activeSheet: previousActiveSheet,
      onSheetsChanged
    } = this.props;

    const {
      dirty,
      stackIdx
    } = this.getCached();

    const previousActiveView = this.getCached().activeView;

    const modeler = this.getModeler();

    const { element } = activeView;

    const activeSheet = {
      ...activeView,
      id: element.id,
      name: 'Diagram',
      order: -1
    };

    if (previousActiveSheet.id !== activeSheet.id) {
      onSheetsChanged([ activeSheet ], activeSheet);
    }

    const activeViewer = modeler.getActiveViewer();

    let propertiesPanel;

    // only attach properties panel if view is switched
    if (activeViewer &&
      (!previousActiveView || previousActiveView.element !== activeView.element)) {
      propertiesPanel = activeViewer.get('propertiesPanel', false);

      if (propertiesPanel) {
        propertiesPanel.attachTo(this.propertiesPanelRef.current);
      }
    }

    // attach or detach overview
    if (activeView.type === 'drd') {
      modeler.detachOverview();
    } else if (previousActiveView && previousActiveView.type === 'drd') {
      modeler.attachOverviewTo(this.overviewRef.current);

      if (isOverviewOpen(this.props)) {
        modeler._emit('overviewOpen');
      }
    }

    // must be called last
    this.setCached({
      activeView,
      dirty: dirty || modeler.getStackIdx() !== stackIdx
    });

    this.handleChanged();
  }

  undo = () => {
    const modeler = this.getModeler();

    modeler.getActiveViewer().get('commandStack').undo();
  }

  redo = () => {
    const modeler = this.getModeler();

    modeler.getActiveViewer().get('commandStack').redo();
  }

  handleChanged = () => {
    const modeler = this.getModeler();

    const {
      onChanged
    } = this.props;

    const activeViewer = modeler.getActiveViewer(),
          activeView = modeler.getActiveView();

    if (!activeViewer) {
      return;
    }

    const dirty = this.isDirty();

    const commandStack = activeViewer.get('commandStack');

    const hasPropertiesPanel = !!activeViewer.get('propertiesPanel', false);

    const hasOverview = activeView.type !== 'drd';

    const inputActive = isInputActive();

    const newState = {
      close: true,
      copy: false,
      cut: false,
      dirty,
      exportAs: 'saveSVG' in activeViewer ? EXPORT_AS : false,
      inputActive,
      overview: hasOverview,
      paste: false,
      propertiesPanel: hasPropertiesPanel,
      redo: commandStack.canRedo(),
      save: true,
      undo: commandStack.canUndo()
    };

    const selection = activeViewer.get('selection', false);

    const hasSelection = selection && !!selection.get();

    const selectionLength = hasSelection ? selection.get().length : 0;

    let editMenu;

    if (activeView.type === 'drd') {
      assign(newState, {
        align: selectionLength > 1,
        defaultCopyCutPaste: inputActive,
        defaultUndoRedo: inputActive,
        distribute: selectionLength > 2,
        editLabel: !inputActive && !!selectionLength,
        lassoTool: !inputActive,
        moveCanvas: !inputActive,
        moveSelection: !inputActive && !!selectionLength,
        removeSelected: inputActive || !!selectionLength,
        selectAll: true,
        zoom: true
      });

      editMenu = getDmnDrdEditMenu(newState);
    } else if (activeView.type === 'decisionTable') {
      assign(newState, {
        defaultCopyCutPaste: true,
        defaultUndoRedo: false,
        hasSelection: activeViewer.get('selection').hasSelection(),
        removeSelected: inputActive,
        selectAll: inputActive
      });

      // ensure backwards compatibility
      // https://github.com/camunda/camunda-modeler/commit/78357e3ed9e6e0255ac8225fbdf451a90457e8bf#diff-bd5be70c4e5eadf1a316c16085a72f0fL17
      newState.dmnRuleEditing = !!selectionLength;
      newState.dmnClauseEditing = !!selectionLength;

      editMenu = getDmnDecisionTableEditMenu(newState);
    } else if (activeView.type === 'literalExpression') {
      assign(newState, {
        defaultCopyCutPaste: true,
        defaultUndoRedo: true,
        removeSelected: true,
        selectAll: true
      });

      // The literalExpressions editor does not fire events when
      // elements are selected, so we always set inputActive to true.
      // cf. https://github.com/camunda/camunda-modeler/pull/2394
      newState.inputActive = true;

      editMenu = getDmnLiteralExpressionEditMenu(newState);
    }

    // ensure backwards compatibility
    // https://github.com/camunda/camunda-modeler/commit/78357e3ed9e6e0255ac8225fbdf451a90457e8bf#diff-bd5be70c4e5eadf1a316c16085a72f0fL17
    newState.activeEditor = activeView.type;
    newState.dmn = true;
    newState.editable = true;
    newState.elementsSelected = !!selectionLength;
    newState.inactiveInput = !inputActive;

    const windowMenu = getDmnWindowMenu(newState);

    if (typeof onChanged === 'function') {
      onChanged({
        ...newState,
        editMenu,
        windowMenu
      });
    }

    this.setState(newState);
  }

  handleError = (event) => {
    const {
      error
    } = event;

    const {
      onError
    } = this.props;

    onError(error);
  }

  handleDistributeElements = (type) => {
    this.triggerAction('distributeElements', {
      type
    });
  }

  handleAlignElements = (type) => {
    this.triggerAction('alignElements', {
      type
    });
  }

  checkImport(prevProps) {
    if (!this.isImportNeeded(prevProps)) {
      return this.checkSheetChange(prevProps);
    }

    const { xml } = this.props;

    this.importXML(xml);
  }

  isImportNeeded(prevProps) {
    const {
      importing
    } = this.state;

    if (importing) {
      return false;
    }

    const {
      xml
    } = this.props;

    if (prevProps && prevProps.xml === xml) {
      return false;
    }

    const {
      lastXML
    } = this.getCached();

    return xml !== lastXML;
  }

  async importXML(xml) {
    const {
      modeler
    } = this.getCached();

    this.setState({
      importing: true
    });

    const importedXML = await this.handleMigration(xml);

    if (!importedXML) {
      this.props.onAction('close-tab');

      return;
    }

    return modeler.importXML(importedXML).then(
      this.ifMounted(({ warnings }) => this.handleImport(null, warnings)),
      this.ifMounted((error) => this.handleImport(error, error.warnings))
    );
  }

  handleMigration = async (xml) => {
    const used = findNamespaceUsages(xml, NAMESPACE_URL_DMN11) ||
      findNamespaceUsages(xml, NAMESPACE_URL_DMN12);

    if (!used) {
      return xml;
    }

    const askDmnMigration = await this.props.getConfig(CONFIG_KEY);

    if (askDmnMigration !== false) {
      const shouldMigrate = await this.shouldMigrate();

      if (!shouldMigrate) {
        return null;
      }
    }

    const {
      onContentUpdated
    } = this.props;

    let migratedXML;

    try {
      migratedXML = await migrateDiagram(xml);
    } catch (err) {
      this.handleError({
        error: err
      });

      return null;
    }

    onContentUpdated(migratedXML);

    return migratedXML;
  }

  async shouldMigrate() {
    const { onAction } = this.props;

    const { button, checkboxChecked } = await onAction('show-dialog', getMigrationDialog());

    if (button === 'yes' && checkboxChecked) {
      this.props.setConfig(CONFIG_KEY, false);
    }

    return button === 'yes';
  }

  checkSheetChange(prevProps) {
    if (!this.shouldOpenActiveSheet(prevProps)) {
      return;
    }

    this.open(this.props.activeSheet.element);
  }

  shouldOpenActiveSheet(prevProps) {
    return !prevProps || prevProps.activeSheet.id !== this.props.activeSheet.id;
  }

  open = (element) => {
    const {
      activeView,
      dirty,
      modeler,
      stackIdx
    } = this.getCached();

    let view = modeler.getView(element);

    if (!view) {

      // try to find view based on ID
      // after re-import reference comparison won't work anymore
      view = modeler.getViews().find(view => view.element.id === element.id);
    }

    if (!view) {
      return;
    }

    if (!activeView || activeView.element !== element) {
      this.setCached({
        dirty: dirty || this.getModeler().getStackIdx() !== stackIdx
      });

      modeler.open(view);

      this.setCached({
        stackIdx: this.getModeler().getStackIdx()
      });
    }
  }

  triggerAction = (action, context) => {
    const {
      layout = {},
      onLayoutChanged: handleLayoutChange
    } = this.props;

    const {
      propertiesPanel: propertiesPanelLayout = {}
    } = layout;

    const modeler = this.getModeler();

    if (action === 'resize') {
      return this.handleResize();
    }

    if (action === 'toggleProperties') {
      const newLayout = {
        propertiesPanel: {
          ...propertiesPanelDefaultLayout,
          ...propertiesPanelLayout,
          open: !propertiesPanelLayout.open
        }
      };

      return handleLayoutChange(newLayout);
    }

    if (action === 'resetProperties') {
      const newLayout = {
        propertiesPanel: {
          ...propertiesPanelDefaultLayout,
          open: true
        }
      };

      return handleLayoutChange(newLayout);
    }

    if (action === 'zoomIn') {
      action = 'stepZoom';

      context = {
        value: 1
      };
    }

    if (action === 'zoomOut') {
      action = 'stepZoom';

      context = {
        value: -1
      };
    }

    if (action === 'resetZoom') {
      action = 'zoom';

      context = {
        value: 1
      };
    }

    if (action === 'zoomFit') {
      action = 'zoom';

      context = {
        value: 'fit-viewport'
      };
    }

    if (action === 'toggleOverview') {
      return this.toggleOverview();
    } else if (action === 'resetOverview') {
      return this.resetOverview();
    }

    return modeler.getActiveViewer()
      .get('editorActions')
      .trigger(action, context);
  }

  /**
   * @returns {CamundaDmnModeler}
   */
  getModeler() {
    const {
      modeler
    } = this.getCached();

    return modeler;
  }

  handleResize = () => {
    const {
      modeler
    } = this.getCached();

    const view = modeler.getActiveView();

    const viewType = view && view.type;

    if (viewType !== 'drd') {
      return;
    }

    const viewer = modeler.getActiveViewer();

    const canvas = viewer.get('canvas');
    const eventBus = viewer.get('eventBus');

    canvas.resized();
    eventBus.fire('propertiesPanel.resized');
  }

  async getXML() {
    const {
      lastXML,
      modeler
    } = this.getCached();

    const stackIdx = modeler.getStackIdx();

    if (!this.isDirty()) {
      return lastXML || this.props.xml;
    }

    let xml = null;
    let error = null;

    try {
      const {
        xml: _xml
      } = await modeler.saveXML({ format: true });

      xml = _xml;
    } catch (_error) {
      error = _error;
    }

    this.setCached({
      dirty: false,
      lastXML: xml,
      stackIdx
    });

    if (error) {
      this.handleError({
        error
      });

      return Promise.reject(error);
    }

    return xml;
  }

  async exportAs(type) {
    let svg;

    try {
      svg = await this.exportSVG();
    } catch (error) {
      this.handleError({ error });

      return Promise.reject(error);
    }

    if (type === 'svg') {
      return svg;
    }

    return generateImage(type, svg);
  }

  async exportSVG() {
    const modeler = this.getModeler();

    const viewer = modeler.getActiveViewer();

    if (!viewer.saveSVG) {
      return Promise.reject(new Error('SVG export not supported in current view'));
    }

    try {
      const { svg } = await viewer.saveSVG();

      return svg;
    } catch (err) {

      return Promise.reject(err);
    }
  }

  handleEditDrdClick = () => {
    const modeler = this.getModeler();

    const drdView = modeler._views.find(({ type }) => type === 'drd');

    if (drdView) {
      modeler.open(drdView);
    }
  }

  toggleOverview = () => {
    const {
      layout,
      onLayoutChanged
    } = this.props;

    const dmnOverview = layout.dmnOverview || overviewDefaultLayout;

    onLayoutChanged({
      dmnOverview: {
        ...dmnOverview,
        open: !dmnOverview.open
      }
    });
  }

  resetOverview() {
    const {
      onLayoutChanged
    } = this.props;

    onLayoutChanged({
      dmnOverview: {
        ...overviewDefaultLayout
      }
    });
  }

  render() {
    const {
      layout,
      onLayoutChanged
    } = this.props;

    const imported = this.getModeler().getDefinitions();

    const {
      importing
    } = this.state;

    const modeler = this.getModeler();

    const activeView = modeler.getActiveView();

    const isDrd = activeView && activeView.type === 'drd';

    const activeViewer = modeler.getActiveViewer();

    const overviewOpen = isOverviewOpen(this.props);

    const hasPropertiesPanel = !importing && activeViewer && !!activeViewer.get('propertiesPanel', false);

    return (
      <div className={ css.DmnEditor }>

        <Loader hidden={ imported && !importing } />

        <Fill slot="toolbar" group="6_align">
          <Button
            title="Align elements left"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('left') }
          >
            <Icon name="align-left-tool" />
          </Button>
          <Button
            title="Align elements center"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('center') }
          >
            <Icon name="align-center-tool" />
          </Button>
          <Button
            title="Align elements right"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('right') }
          >
            <Icon name="align-right-tool" />
          </Button>
          <Button
            title="Align elements top"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('top') }>
            <Icon name="align-top-tool" />
          </Button>
          <Button
            title="Align elements middle"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('middle') }
          >
            <Icon name="align-middle-tool" />
          </Button>
          <Button
            title="Align elements bottom"
            disabled={ !this.state.align }
            onClick={ () => this.handleAlignElements('bottom') }
          >
            <Icon name="align-bottom-tool" />
          </Button>
        </Fill>

        <Fill slot="toolbar" group="7_distribute">
          <Button
            title="Distribute elements horizontally"
            disabled={ !this.state.distribute }
            onClick={ () => this.handleDistributeElements('horizontal') }
          >
            <Icon name="distribute-horizontal-tool" />
          </Button>
          <Button
            title="Distribute elements vertically"
            disabled={ !this.state.distribute }
            onClick={ () => this.handleDistributeElements('vertical') }
          >
            <Icon name="distribute-vertical-tool" />
          </Button>
        </Fill>

        {
          !isDrd && (
            <div className="top">
              <button id="button-edit-drd" className="btn btn-primary" onClick={ this.handleEditDrdClick }>Edit DRD</button>
              <button id="button-toggle-overview" className="btn btn-primary" onClick={ this.toggleOverview }>{ overviewOpen ? 'Close' : 'Open' } Overview</button>
            </div>
          )
        }

        <div className="bottom">

          {
            !isDrd && (
              <OverviewContainer
                className="overview"
                layout={ layout }
                ref={ this.overviewRef }
                onLayoutChanged={ onLayoutChanged } />
            )
          }

          <div className={
            classNames(
              'diagram',
              { 'drd': isDrd }
            )
          } ref={ this.ref }></div>

          {
            hasPropertiesPanel && (
              <PropertiesContainer
                className="properties"
                layout={ layout }
                ref={ this.propertiesPanelRef }
                onLayoutChanged={ onLayoutChanged } />
            )
          }

        </div>

        <EngineProfile type="dmn" engineProfile={ engineProfile } />

      </div>
    );
  }

  static createCachedState(props) {
    const {
      name,
      version
    } = Metadata;

    const {
      getPlugins,
      onAction,
      onError
    } = props;

    // notify interested parties that modeler will be configured
    const handleMiddlewareExtensions = (middlewares) => {
      onAction('emit-event', {
        type: 'dmn.modeler.configure',
        payload: {
          middlewares
        }
      });
    };

    const {
      options,
      warnings
    } = configureModeler(getPlugins, {
      exporter: {
        name,
        version
      }
    }, handleMiddlewareExtensions);

    if (warnings.length && isFunction(onError)) {
      onError(
        'Problem(s) configuring DMN editor: \n\t' +
        warnings.map(error => error.message).join('\n\t') +
        '\n'
      );
    }

    const modeler = new CamundaDmnModeler({
      ...options,
      position: 'absolute'
    });

    const stackIdx = modeler.getStackIdx();

    // notify interested parties that modeler was created
    onAction('emit-event', {
      type: 'dmn.modeler.created',
      payload: {
        modeler
      }
    });

    return {
      __destroy: () => {
        modeler.destroy();
      },
      dirty: false,
      lastXML: null,
      modeler,
      stackIdx
    };
  }

}

export default WithCache(WithCachedState(DmnEditor));

// helpers //////////

function isCachedStateChange(prevProps, props) {
  return prevProps.cachedState !== props.cachedState;
}

function getMigrationDialog() {
  return {
    type: 'warning',
    title: 'Deprecated DMN 1.1 Diagram Detected',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'yes', label: 'Yes' }
    ],
    defaultId: 1,
    message: 'Would you like to migrate your diagram to DMN 1.3?',
    detail: [
      'Only DMN 1.3 diagrams can be opened with Camunda Modeler v4.0.0 or later.',
    ].join('\n'),
    checkboxChecked: true,
    checkboxLabel: 'Do not ask again.'
  };
}

/**
 * Check layout whether overview is open.
 *
 * @param {Object} props
 *
 * @returns {boolean}
 */
function isOverviewOpen(props) {
  const layout = props.layout || {};

  const dmnOverview = layout.dmnOverview;

  return !dmnOverview || dmnOverview.open;
}

/**
 * Check layout whether overview was opened.
 *
 * @param {Object} props
 * @param {Object} prevProps
 *
 * @returns {boolean}
 */
function isOverviewOpened(props, prevProps) {
  return isOverviewOpen(prevProps) === false && isOverviewOpen(props) === true;
}
