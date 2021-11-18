/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React, { PureComponent } from 'react';

import classNames from 'classnames';

import css from './Tabbed.less';

import {
  OverlayDropdown
} from '../../shared/ui';

import {
  addScroller,
  removeScroller
} from '../util/scroller';

import {
  addDragger
} from '../util/dragger';

import {
  debounce
} from '../../util';

import TabCloseIcon from '../../../resources/icons/TabClose.svg';
import CircleIcon from '../../../resources/icons/Circle.svg';
import PlusIcon from '../../../resources/icons/Plus.svg';

// todo: use standard icons?
import BPMNIcon from '../../../resources/icons/file-types/BPMN-16x16.svg';
import DMNIcon from '../../../resources/icons/file-types/DMN-16x16.svg';
import FormIcon from '../../../resources/icons/file-types/Form-16x16.svg';

const noop = () => {};

const TABS_OPTS = {
  selectors: {
    tabsContainer: '.tabs-container',
    tab: '.tab',
    active: '.active',
    ignore: '.ignore'
  }
};

// todo handle this via tabs provider?
const TABS_ICONS = {
  'bpmn': BPMNIcon,
  'dmn': DMNIcon,
  'form': FormIcon,
  'cloud-bpmn': BPMNIcon,
  'cloud-form': FormIcon
};


export default class TabLinks extends PureComponent {
  constructor(props) {
    super(props);

    this.updateScroller = debounce(this.updateScroller);

    this.tabLinksRef = React.createRef();
  }

  componentDidMount() {
    const {
      draggable,
      scrollable
    } = this.props;

    if (draggable) {
      addDragger(this.tabLinksRef.current, TABS_OPTS, this.handleDrag, this.handleDragStart);
    }

    if (scrollable) {
      this.scroller = addScroller(this.tabLinksRef.current, TABS_OPTS, this.handleScroll);
    }
  }

  componentWillUnmount() {
    if (this.scroller) {
      removeScroller(this.scroller);

      this.scroller = null;
    }
  }

  updateScroller = () => {
    if (this.scroller) {
      this.scroller.update();
    }
  }

  componentDidUpdate() {
    this.updateScroller();
  }

  handleScroll = (node) => {
    const {
      onSelect,
      tabs
    } = this.props;

    const tab = tabs.find(({ id }) => id === node.dataset.tabId);

    onSelect(tab);
  }

  handleDragStart = ({ dragTab }) => {
    const {
      tabs,
      onSelect
    } = this.props;

    const tab = tabs.find(({ id }) => id === dragTab.dataset.tabId);

    onSelect(tab);
  }

  handleDrag = ({ dragTab, newIndex }) => {
    const {
      tabs,
      onMoveTab
    } = this.props;

    const tab = tabs.find(({ id }) => id === dragTab.dataset.tabId);

    onMoveTab(tab, newIndex);
  }

  isDirty = (tab) => {
    const {
      dirtyTabs,
      unsavedTabs
    } = this.props;

    return (dirtyTabs && !!dirtyTabs[ tab.id ]) ||
           (unsavedTabs && !!unsavedTabs[ tab.id ]);
  }

  render() {

    const {
      activeTab,
      tabs,
      newFileItems,
      onSelect,
      onContextMenu,
      onClose,
      placeholder,
      className
    } = this.props;

    return (
      <div
        className={ classNames(css.LinksContainer, className) }
        ref={ this.tabLinksRef }>
        <div className="tabs-container">
          {
            tabs.map(tab => {
              const dirty = this.isDirty(tab);

              return (
                <span
                  key={ tab.id }
                  data-tab-id={ tab.id }
                  title={ tab.title }
                  className={ classNames('tab', {
                    active: tab === activeTab,
                    dirty
                  }) }
                  onClick={ () => onSelect(tab, event) }
                  onContextMenu={ (event) => (onContextMenu || noop)(tab, event) }
                  draggable
                >
                  <span className="tab-icon">
                    {
                      getTabIcon(tab)
                    }
                  </span>
                  <p className="tab-name">{tab.name}</p>
                  {
                    onClose && (tab === activeTab) && <span
                      className="tab-close"
                      title="Close Tab"
                      onClick={ e => {
                        e.preventDefault();
                        e.stopPropagation();

                        onClose(tab);
                      } }
                    >
                      {
                        dirty ? <CircleIcon className="icon dirty-icon" /> : null
                      }
                      <TabCloseIcon className="icon close-icon" />
                    </span>
                  }
                </span>
              );
            })
          }

          {
            placeholder && <span
              key="__placeholder"
              className={ classNames('tab placeholder ignore', {
                active: tabs.length === 0
              }) }
              onClick={ placeholder.onClick }
              title={ placeholder.title }
            >
              { placeholder.label }
            </span>
          }
        </div>

        {/* todo: handle this as own component */}
        <div className="tab-actions-container">
          <OverlayDropdown
            title="Create new ..."
            offset={ { top: 0, right: 0 } }
            items={ newFileItems || [] }
          >
            <PlusIcon />
          </OverlayDropdown>
        </div>
      </div>
    );
  }
}


// helper ///////////
function getTabIcon(tab) {
  const {
    type
  } = tab;

  const TabIcon = TABS_ICONS[type] || null;

  return <TabIcon />;
}