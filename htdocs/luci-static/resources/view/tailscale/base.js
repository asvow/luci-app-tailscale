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

function getServiceStatus() {
	return Promise.resolve(callServiceList('tailscale')).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['tailscale']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function getLoginStatus() {
	return fs.exec("/usr/sbin/tailscale", ["status", "--json"]).then(function(res) {
		var status = JSON.parse(res.stdout);
		if (!status.AuthURL && status.BackendState == "NeedsLogin") {
			fs.exec("/usr/sbin/tailscale", ["login"]);
		}
		var displayName = status.BackendState == "Running" ? status.User[status.Self.UserID].DisplayName : undefined;
		return {
			backendState: status.BackendState,
			authURL: status.AuthURL,
			displayName: displayName
		};
	}).catch(function(error) {
		return { backendState: undefined, authURL: undefined, displayName: undefined };
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
			uci.load('tailscale'),
			getServiceStatus()
		]);
	},

	render: function(data) {
		var m, s, o;
		var isRunning = data[1];

		m = new form.Map('tailscale', _('Tailscale'), _('Tailscale is a cross-platform and easy to use virtual LAN.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, renderStatus(isRunning))
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
			poll.add(function() {
				return Promise.resolve(getLoginStatus()).then(function(res) {
					document.getElementById('login_status_div').innerHTML = renderLogin(res.backendState, res.authURL, res.displayName);
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

		o = s.option(form.Flag, 'acceptRoutes', _('Auto Mesh'), _('Expose physical network routes onto Tailscale.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'hostname', _('Device Name'), _("Leave blank to use the device's hostname."));
		o.default = '';
		o.rmempty = true;

		o = s.option(form.Value, 'advertiseRoutes', _('Expose Subnets'), _('e.g. 10.0.0.0/24'));
		o.datatype = 'cidr4';
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

		o = s.option(form.Value, 'loginServer', _('Server address'));
		o.default = '';
		o.rmempty = true;

		o = s.option(form.Value, 'authKey', _('Auth Key'));
		o.default = '';
		o.rmempty = true;

		return m.render();
	}
});
