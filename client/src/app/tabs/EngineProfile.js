/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React, { Fragment, useState } from 'react';
import classnames from 'classnames';

import { isNil } from 'min-dash';

import semverCompare from 'semver-compare';
import toSemverArray from 'to-semver';

import { Overlay } from '../../shared/ui';
import { Fill } from '../slot-fill';

import Arrow from '../../../resources/icons/Arrow.svg';
import LinkArrow from '../../../resources/icons/LinkArrow.svg';

import Flags, { DISABLE_ZEEBE, DISABLE_PLATFORM } from '../../util/Flags';
import { ENGINES, ENGINE_PROFILES } from '../../util/Engines';

import css from './EngineProfile.less';


export function EngineProfile(props) {
  const {
    engineProfile = null,
    engineProfiles = ENGINE_PROFILES,
    setEngineProfile = null,
    type
  } = props;

  const [ open, setOpen ] = React.useState(false, []);
  const buttonRef = React.useRef(null);

  let label = 'No platform selected';

  if (engineProfile) {
    const {
      executionPlatform,
      executionPlatformVersion
    } = engineProfile;

    if (setEngineProfile) {
      label = `${ executionPlatform } ${ executionPlatformVersion }`;
    } else {
      label = executionPlatform;
    }
  }

  return (
    <Fill slot="status-bar__file" group="1_engine">
      {
        open &&
        <EngineProfileOverlay
          anchor={ buttonRef.current }
          onClose={ () => setOpen(false) }
          engineProfile={ engineProfile }
          engineProfiles={ engineProfiles }
          setEngineProfile={ setEngineProfile }
          type={ type }
        />
      }
      <button
        className={ classnames('btn', { 'btn--active': open }) }
        onClick={ () => setOpen(value => !value) } ref={ buttonRef }
        title={ setEngineProfile ? 'Set execution platform' : 'Display execution platform information' }
      >
        { label }
        {
          setEngineProfile && <Arrow className="icon icon-arrow-down" />
        }
      </button>
    </Fill>
  );
}

function EngineProfileOverlay(props) {
  const {
    anchor,
    onClose,
    engineProfile,
    engineProfiles,
    setEngineProfile
  } = props;

  return (
    <Overlay anchor={ anchor } onClose={ onClose }>
      {
        setEngineProfile
          ? (
            <EngineProfileSelection
              engineProfile={ engineProfile }
              engineProfiles={ engineProfiles }
              onClose={ onClose }
              setEngineProfile={ setEngineProfile } />
          )
          : <EngineProfileDescription engineProfile={ engineProfile } />
      }
    </Overlay>
  );
}

function EngineProfileSelection(props) {
  const {
    engineProfile,
    engineProfiles,
    onClose
  } = props;

  const [ selectedEngineProfile, setSelectedEngineProfile ] = useState(engineProfile);

  const [ error, setError ] = useState(null);

  const enabledEngineProfiles = filterEngineProfiles(engineProfiles);

  const onSelectEngineProfile = (newExecutionPlatform, newExecutionPlatformVersion) => {
    const newEngineProfile = {
      executionPlatform: newExecutionPlatform,
      executionPlatformVersion: newExecutionPlatformVersion
    };

    if (engineProfilesEqual(selectedEngineProfile, newEngineProfile)) {
      setSelectedEngineProfile(null);
    } else {
      setSelectedEngineProfile({
        executionPlatform: newExecutionPlatform,
        executionPlatformVersion: newExecutionPlatformVersion
      });

      setError(null);
    }
  };

  const setEngineProfile = () => {
    if (!selectedEngineProfile) {
      setError(true);

      return;
    }

    if (enabledEngineProfiles.length === 1 && isEngineDisabled(selectedEngineProfile, engineProfiles)) {
      const allowedEngine = filterEngineProfiles(engineProfiles)[0];

      props.setEngineProfile({
        executionPlatform: allowedEngine.executionPlatform,
        executionPlatformVersion: allowedEngine.executionPlatformVersions[0]
      });
    }

    if (!engineProfilesEqual(selectedEngineProfile, engineProfile)) {
      props.setEngineProfile(selectedEngineProfile);
    }

    onClose();
  };

  return (
    <Fragment>
      <Overlay.Title>
        Select the execution platform
      </Overlay.Title>
      <Overlay.Body className={ css.EngineProfileSelection }>
        <div className="form-group form-inline">
          {
            enabledEngineProfiles.map((engineProfile) => {
              return <EngineProfileOption
                engineProfile={ engineProfile }
                key={ engineProfile.executionPlatform }
                onSelectEngineProfile={ onSelectEngineProfile }
                selectedEngineProfile={ selectedEngineProfile }
                onlyEngine={ enabledEngineProfiles.length === 1 } />;
            })
          }
          { error && <div className="error">Select one option.</div> }
          <button className="btn btn-primary apply" onClick={ setEngineProfile }>Apply</button>
        </div>
      </Overlay.Body>
      <Overlay.Footer>
        <Link href="https://docs.camunda.org/manual/latest/">Learn more</Link>
      </Overlay.Footer>
    </Fragment>
  );
}

function EngineProfileOption(props) {
  const {
    engineProfile,
    onSelectEngineProfile,
    selectedEngineProfile,
    onlyEngine
  } = props;

  const {
    executionPlatform,
    executionPlatformVersions
  } = engineProfile;

  const id = `execution-platform-${ toKebapCase(executionPlatform) }`;

  const checked = !isNil(selectedEngineProfile) && selectedEngineProfile.executionPlatform === executionPlatform;

  const [ selectedExecutionPlatformVersion, setSelectedExecutionPlatformVersion ] = useState(
    selectedEngineProfile && selectedEngineProfile.executionPlatform === executionPlatform
      ? selectedEngineProfile.executionPlatformVersion
      : executionPlatformVersions[ 0 ]);

  const onSelectExecutionPlatformVersion = (executionPlatformVersion) => {
    setSelectedExecutionPlatformVersion(executionPlatformVersion);

    onSelectEngineProfile(executionPlatform, executionPlatformVersion);
  };

  return <div
    className="custom-control custom-radio platform"
    key={ executionPlatform }>

    { onlyEngine ? null
      : (
        <input
          id={ id }
          className="custom-control-input"
          type="radio"
          checked={ checked }
          onChange={ () => {} }
          onClick={ () => onSelectEngineProfile(executionPlatform, selectedExecutionPlatformVersion) } />
      )
    }
    <label className="custom-control-label" htmlFor={ id }>
      { `${ executionPlatform }${ executionPlatformVersions.length === 1 ? ` ${ executionPlatformVersions[ 0 ] }` : '' }` }
    </label>
    {
      executionPlatformVersions.length > 1
        ? (
          <select
            id={ `execution-platform-version-${ toKebapCase(executionPlatform) }` }
            className="form-control version"
            onChange={ ({ target }) => onSelectExecutionPlatformVersion(target.value) }
            value={ selectedExecutionPlatformVersion }>
            {
              executionPlatformVersions.map((executionPlatformVersion => {
                return <option
                  key={ executionPlatformVersion }
                  value={ executionPlatformVersion }>
                  { executionPlatformVersion }
                </option>;
              }))
            }
          </select>
        )
        : null
    }
  </div>;
}

function EngineProfileDescription(props) {
  const { engineProfile } = props;

  const { executionPlatform } = engineProfile;

  if (executionPlatform === ENGINES.PLATFORM) {
    return (
      <Fragment>
        <Overlay.Body>
          This diagram is supposed to be executed on <em>Camunda Platform</em>.
          The properties panel provides the related implementation features.
          This diagram can be deployed to and started in a connected <em>Camunda Platform</em> instance.
        </Overlay.Body>
        <Overlay.Footer>
          <Link href="https://docs.camunda.org/manual/latest/">Learn more</Link>
        </Overlay.Footer>
      </Fragment>
    );
  } else if (executionPlatform === ENGINES.CLOUD) {
    return (
      <Fragment>
        <Overlay.Body>
          This diagram is supposed to be executed on <em>Camunda Cloud</em>.
          The properties panel provides the related implementation features.
          This diagram can be deployed to and started in a connected <em>Camunda Cloud</em> instance.
        </Overlay.Body>
        <Overlay.Footer>
          <Link href="https://docs.camunda.io/">Learn more</Link>
        </Overlay.Footer>
      </Fragment>
    );
  } else if (executionPlatform === 'Camunda Platform or Cloud') {
    return (
      <Fragment>
        <Overlay.Body>
          This form is supposed to be used with <em>Camunda Platform</em> or <em>Camunda Cloud</em>.
          The properties panel provides the related implementation features.
          This form can be attached to a BPMN diagram or deployment
          and gets rendered in a connected Camunda Tasklist.
        </Overlay.Body>
        <Overlay.Footer>
          <Link href="https://docs.camunda.org/manual/latest/">Learn more</Link>
        </Overlay.Footer>
      </Fragment>
    );
  }
}

function Link(props) {
  const {
    href,
    children
  } = props;

  return (
    <a className={ css.Link } href={ href }>
      { children }
      <LinkArrow />
    </a>
  );
}

function filterEngineProfiles(engineProfiles) {

  if (!Flags.get(DISABLE_PLATFORM) && ! Flags.get(DISABLE_ZEEBE))
    return engineProfiles;

  return engineProfiles.filter(
    engineProfile => (
      Flags.get(DISABLE_PLATFORM) && engineProfile.executionPlatform !== ENGINES.PLATFORM ||
      Flags.get(DISABLE_ZEEBE) && engineProfile.executionPlatform !== ENGINES.CLOUD
    ));
}

function isEngineDisabled(engineProfile, engineProfiles) {
  return !filterEngineProfiles(engineProfiles).includes(engineProfile);
}

export function engineProfilesEqual(a, b) {
  return !isNil(a)
    && !isNil(b)
    && a.executionPlatform === b.executionPlatform
    && semverCompare(toSemver(a.executionPlatformVersion), toSemver(b.executionPlatformVersion)) === 0;
}

export function isKnownEngineProfile(engineProfile = {}) {
  if (!engineProfile.executionPlatform || !engineProfile.executionPlatformVersion) {
    return false;
  }

  const knownEngineProfile = ENGINE_PROFILES.find(({ executionPlatform }) => executionPlatform === engineProfile.executionPlatform);

  if (!knownEngineProfile || !knownEngineProfile.executionPlatformVersions.includes(engineProfile.executionPlatformVersion)) {
    return false;
  }

  return true;
}

export function toKebapCase(string) {
  return string.replace(/\s/, '-').toLowerCase();
}

function toSemver(string) {
  return toSemverArray([ string ])[ 0 ];
}