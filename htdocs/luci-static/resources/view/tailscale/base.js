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
	return L.resolveDefault(callServiceList('tailscale'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['tailscale']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function getLoginStatus() {
	return fs.exec("/usr/sbin/tailscale", ["status"]).then(function(res) {
		if (res.stdout.includes("Logged out"))
			return false;
		else
			return true;
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

function renderLogin(isLoggedIn) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isLoggedIn) {
		renderHTML = String.format(spanTemp, 'green', _('Logged'), _('IN'));
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Logged'), _('OUT'));
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

		m = new form.Map('tailscale', _('Tailscale'),
			_('Tailscale is a cross-platform and easy to use virtual LAN.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById("service_status");
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('Collecting data ...'))
			]);
		}

		s = m.section(form.NamedSection, 'settings', 'config');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;
		
		o = s.option(form.DummyValue, 'login_status', _('Login Status'));
		o.depends('enabled', '1');
		o.renderWidget = function(section_id, option_id) {
			poll.add(function() {
				return L.resolveDefault(getLoginStatus()).then(function(res) {
					document.getElementById('login_status_div').innerHTML = renderLogin(res);
				});
			});
	
			return E('div', { 'id': 'login_status_div' }, _('Collecting data ...'));
		};

		return m.render();
	}
});
