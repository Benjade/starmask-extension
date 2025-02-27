import React, { Component } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import { debounce } from 'lodash';
import copyToClipboard from 'copy-to-clipboard/index';
import ENS from 'ethjs-ens';
import networkMap from 'ethereum-ens-network-map';
import log from 'loglevel';
import { ellipsify } from '../../send.utils';
import {
  isValidDomainName,
  isValidAddress,
  isValidReceipt,
  // isValidAddressHead,
} from '../../../../helpers/utils/util';
import { MAINNET_NETWORK_ID } from '../../../../../../shared/constants/network';

// Local Constants
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_X_ERROR_ADDRESS = '0x';

export default class EnsInput extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    className: PropTypes.string,
    network: PropTypes.string,
    selectedAddress: PropTypes.string,
    selectedName: PropTypes.string,
    onChange: PropTypes.func,
    updateEnsResolution: PropTypes.func,
    scanQrCode: PropTypes.func,
    updateEnsResolutionError: PropTypes.func,
    onPaste: PropTypes.func,
    onReset: PropTypes.func,
    onValidAddressTyped: PropTypes.func,
    contact: PropTypes.object,
    value: PropTypes.string,
    internalSearch: PropTypes.bool,
    validating: PropTypes.bool,
    onError: PropTypes.string,
  };

  state = {
    input: '',
    toError: null,
    ensResolution: undefined,
  };

  componentDidMount() {
    const { network, internalSearch } = this.props;
    const networkHasEnsSupport = getNetworkEnsSupport(network);
    this.setState({ ensResolution: ZERO_ADDRESS });

    if (networkHasEnsSupport && !internalSearch) {
      const provider = global.ethereumProvider;
      this.ens = new ENS({ provider, network });
      this.checkName = debounce(this.lookupEnsName, 200);
    }
  }

  componentDidUpdate(prevProps) {
    const { input } = this.state;
    const { network, value, internalSearch } = this.props;

    let newValue;

    // Set the value of our input based on QR code provided by parent
    const newProvidedValue = input !== value && prevProps.value !== value;
    if (newProvidedValue) {
      newValue = value;
    }

    if (prevProps.network !== network) {
      if (getNetworkEnsSupport(network)) {
        const provider = global.ethereumProvider;
        this.ens = new ENS({ provider, network });
        this.checkName = debounce(this.lookupEnsName, 200);
        if (!newProvidedValue) {
          newValue = input;
        }
      } else {
        // ens is null on mount on a network that does not have ens support
        // this is intended to prevent accidental lookup of domains across
        // networks
        this.ens = null;
        this.checkName = null;
      }
    }

    if (newValue !== undefined) {
      this.onChange({ target: { value: newValue } });
    }
    if (!internalSearch && prevProps.internalSearch) {
      this.resetInput();
    }
  }

  resetInput = () => {
    const {
      updateEnsResolution,
      updateEnsResolutionError,
      onReset,
    } = this.props;
    this.onChange({ target: { value: '' } });
    onReset();
    updateEnsResolution('');
    updateEnsResolutionError('');
  };

  lookupEnsName = (ensName) => {
    const { network } = this.props;
    const recipient = ensName.trim();

    log.info(`ENS attempting to resolve name: ${recipient}`);
    this.ens
      .lookup(recipient)
      .then((address) => {
        if (address === ZERO_ADDRESS) {
          throw new Error(this.context.t('noAddressForName'));
        }
        if (address === ZERO_X_ERROR_ADDRESS) {
          throw new Error(this.context.t('ensRegistrationError'));
        }
        this.props.updateEnsResolution(address);
      })
      .catch((reason) => {
        if (
          isValidDomainName(recipient) &&
          reason.message === 'ENS name not defined.'
        ) {
          this.props.updateEnsResolutionError(
            network === MAINNET_NETWORK_ID
              ? this.context.t('noAddressForName')
              : this.context.t('ensNotFoundOnCurrentNetwork'),
          );
        } else {
          log.error(reason);
          this.props.updateEnsResolutionError(reason.message);
        }
      });
  };

  onPaste = (event) => {
    event.clipboardData.items[0].getAsString((text) => {
      if (isValidReceipt(text)) {
        this.props.onPaste(text);
      }
    });
  };

  onChange = (e) => {
    const {
      // network,
      onChange,
      updateEnsResolution,
      updateEnsResolutionError,
      onValidAddressTyped,
      internalSearch,
    } = this.props;
    const input = e.target.value;
    // const networkHasEnsSupport = getNetworkEnsSupport(network);

    this.setState({ input }, () => onChange(input));
    if (internalSearch) {
      return null;
    }
    // Empty ENS state if input is empty
    // maybe scan ENS

    // if (
    //   !networkHasEnsSupport &&
    //   !isValidAddress(input) &&
    //   !isValidAddressHead(input)
    // ) {
    //   updateEnsResolution('');
    //   updateEnsResolutionError(
    //     networkHasEnsSupport ? '' : 'Network does not support ENS',
    //   );
    //   return null;
    // }

    if (isValidDomainName(input)) {
      this.lookupEnsName(input);
    } else if (onValidAddressTyped && isValidAddress(input)) {
      onValidAddressTyped(input);
    } else {
      updateEnsResolution('');
      updateEnsResolutionError('');
    }
    return null;
  };

  render() {
    const { t } = this.context;
    const { className, selectedAddress } = this.props;
    const { input } = this.state;

    if (selectedAddress) {
      return this.renderSelected();
    }

    return (
      <div className={classnames('ens-input', className)}>
        <div
          className={classnames('ens-input__wrapper', {
            'ens-input__wrapper__status-icon--error': false,
            'ens-input__wrapper__status-icon--valid': false,
          })}
        >
          <div className="ens-input__wrapper__status-icon" />
          <input
            className="ens-input__wrapper__input"
            type="text"
            dir="auto"
            placeholder={t('recipientAddressPlaceholder')}
            onChange={this.onChange}
            onPaste={this.onPaste}
            value={selectedAddress || input}
            autoFocus
            data-testid="ens-input"
          />
          <button
            className={classnames('ens-input__wrapper__action-icon', {
              'ens-input__wrapper__action-icon--erase': input,
              // 'ens-input__wrapper__action-icon--qrcode': !input,
              '': !input,
            })}
            onClick={() => {
              if (input) {
                this.resetInput();
                // } else {
                // this.props.scanQrCode();
              }
            }}
          />
        </div>
      </div>
    );
  }

  renderSelected() {
    const { t } = this.context;
    const {
      className,
      selectedAddress,
      selectedName,
      contact = {},
    } = this.props;
    const name = contact.name || selectedName;

    return (
      <div className={classnames('ens-input', className)}>
        <div className="ens-input__wrapper ens-input__wrapper--valid">
          <div className="ens-input__wrapper__status-icon ens-input__wrapper__status-icon--valid" />
          <div
            className="ens-input__wrapper__input ens-input__wrapper__input--selected"
            placeholder={t('recipientAddress')}
            onChange={this.onChange}
          >
            <div className="ens-input__selected-input__title">
              {name || ellipsify(selectedAddress)}
            </div>
            {name && (
              <div className="ens-input__selected-input__subtitle">
                {selectedAddress}
              </div>
            )}
          </div>
          <div
            className="ens-input__wrapper__action-icon ens-input__wrapper__action-icon--erase"
            onClick={this.resetInput}
          />
        </div>
      </div>
    );
  }

  ensIcon(recipient) {
    const { hoverText } = this.state;

    return (
      <span
        className="#ensIcon"
        title={hoverText}
        style={{
          position: 'absolute',
          top: '16px',
          left: '-25px',
        }}
      >
        {this.ensIconContents(recipient)}
      </span>
    );
  }

  ensIconContents() {
    const { loadingEns, ensFailure, ensResolution, toError } = this.state;

    if (toError) {
      return null;
    }

    if (loadingEns) {
      return (
        <img
          src="images/loading.svg"
          style={{
            width: '30px',
            height: '30px',
            transform: 'translateY(-6px)',
          }}
        />
      );
    }

    if (ensFailure) {
      return <i className="fa fa-warning fa-lg warning'" />;
    }

    if (ensResolution && ensResolution !== ZERO_ADDRESS) {
      return (
        <i
          className="fa fa-check-circle fa-lg cursor-pointer"
          style={{ color: 'green' }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            copyToClipboard(ensResolution);
          }}
        />
      );
    }

    return null;
  }
}

function getNetworkEnsSupport(network) {
  return Boolean(networkMap[network]);
}
