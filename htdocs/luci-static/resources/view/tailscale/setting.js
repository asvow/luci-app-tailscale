/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 asvow
 */

'use strict';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require view';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getStatus() {
	var status = {};
	return Promise.resolve(callServiceList('tailscale')).then(function (res) {
		try {
			status.isRunning = res['tailscale']['instances']['instance1']['running'];
		} catch (e) {
			status.isRunning = false;
		}
		return fs.exec("/usr/sbin/tailscale", ["status", "--json"]);
	}).then(function(res) {
		var tailscaleStatus = JSON.parse(res.stdout);
		if (!tailscaleStatus.AuthURL && tailscaleStatus.BackendState == "NeedsLogin") {
			fs.exec("/usr/sbin/tailscale", ["login"]);
		}
		status.backendState = tailscaleStatus.BackendState;
		status.authURL = tailscaleStatus.AuthURL;
		status.displayName = status.backendState == "Running" ? tailscaleStatus.User[tailscaleStatus.Self.UserID].DisplayName : undefined;
		return status;
	}).catch(function(error) {
		status.backendState = undefined;
		status.authURL = undefined;
		status.displayName = undefined;
		return status;
	});
}

function renderStatus(isRunning) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		renderHTML = String.format(spanTemp, 'green', _('Tailscale'), _('RUNNING'));
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Tailscale'), _('NOT RUNNING'));
	}

	return renderHTML;
}

function renderLogin(loginStatus, authURL, displayName) {
	var spanTemp = '<span style="color:%s">%s</span>';
	var renderHTML;
	if (loginStatus == "NeedsLogin") {
		renderHTML = String.format('<a href="%s" target="_blank">%s</a>', authURL, _('Needs Login'));
	} else if (loginStatus == "Running") {
		renderHTML = String.format('<a href="%s" target="_blank">%s</a>', 'https://login.tailscale.com/admin/machines', displayName);
		renderHTML += String.format('<br><a style="color:green" id="logout_button">%s</a>', _('Logout and Unbind'));
	} else {
		renderHTML = String.format(spanTemp, 'orange', _('NOT RUNNING'));
	}

	return renderHTML;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('tailscale')
		]);
	},

	render: function(data) {
		var m, s, o;
		var isRunning = data[1];

		m = new form.Map('tailscale', _('Tailscale'), _('Tailscale is a cross-platform and easy to use virtual LAN.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function() {
				return Promise.resolve(getStatus()).then(function(res) {
					var service_view = document.getElementById("service_status");
					var login_view = document.getElementById("login_status_div");
					service_view.innerHTML = renderStatus(res.isRunning);	
					login_view.innerHTML = renderLogin(res.backendState, res.authURL, res.displayName);
					var logoutButton = document.getElementById('logout_button');
					if (logoutButton) {
						logoutButton.onclick = function() {
							if (confirm(_('Are you sure you want to logout and unbind the current device?'))) {
								fs.exec("/usr/sbin/tailscale", ["logout"]);
							}
						}
					}
				});
			});
	
			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('Collecting data ...'))
			]);
		}

		s = m.section(form.NamedSection, 'settings', 'config');
		s.title = _('Basic Settings');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.DummyValue, 'login_status', _('Login Status'));
		o.depends('enabled', '1');
		o.renderWidget = function(section_id, option_id) {
			return E('div', { 'id': 'login_status_div' }, _('Collecting data ...'));
		};

		o = s.option(form.Value, 'port', _('Port'), _('Set the Tailscale port number.'));
		o.datatype = 'port';
		o.default = '41641';
		o.rmempty = false;

		o = s.option(form.Value, 'config_path', _('Workdir'), _('The working directory contains config files, audit logs, and runtime info.'));
		o.default = '/etc/tailscale';
		o.rmempty = false;

		o = s.option(form.ListValue, 'fw_mode', _('Firewall Mode'));
		o.value('nftables', 'nftables');
		o.value('iptables', 'iptables');
		o.default = 'nftables';
		o.rmempty = false;

		o = s.option(form.Flag, 'log_stdout', _('Output Log'), _('Logging program activities.'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'log_stderr', _('Error Log'), _('Logging program errors and exceptions.'));
		o.default = o.enabled;
		o.rmempty = false;

		s = m.section(form.NamedSection, 'settings', 'config');
		s.title = _('Advanced Settings');

		o = s.option(form.Flag, 'acceptRoutes', _('Auto Mesh'), _('Accept subnet routes that other nodes advertise.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'hostname', _('Device Name'), _("Leave blank to use the device's hostname."));
		o.default = '';
		o.rmempty = true;

		o = s.option(form.Flag, 'acceptDNS', _('Accept DNS'), _('Accept DNS configuration from the Tailscale admin console.'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'advertiseExitNode', _('Exit Node'), _('Offer to be an exit node for outbound internet traffic from the Tailscale network.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'advertiseRoutes', _('Expose Subnets'), _('Expose physical network routes onto Tailscale. e.g. 10.0.0.0/24'));
		o.default = '';
		o.rmempty = true;

		o = s.option(form.MultiValue, 'access', _('Access Control'));
		o.value('tsfwlan', _('Tailscale access LAN'));
		o.value('tsfwwan', _('Tailscale access WAN'));
		o.value('lanfwts', _('LAN access Tailscale'));
		o.value('wanfwts', _('WAN access Tailscale'));
		o.default = "tsfwlan tsfwwan lanfwts";
		o.depends('acceptRoutes', '1');
		o.rmempty = false;

		s = m.section(form.NamedSection, 'settings', 'config');
		s.title = _('Custom Server Settings');
		s.description = String.format(_('Use %s to deploy a private server.'), '<a href="https://github.com/juanfont/headscale" target="_blank">headscale</a>');

		o = s.option(form.Value, 'loginServer', _('Server Address'));
		o.default = '';
		o.rmempty = true;

		o = s.option(form.Value, 'authKey', _('Auth Key'));
		o.default = '';
		o.rmempty = true;

		return m.render();
	}
});
