/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 asvow
 */
'use strict';
'require fs';
'require poll';
'require ui';
'require view';

return view.extend({
	logs: [],
	reverseLogs: false,

	load: function () {
		var self = this;
		/* Thanks to @animegasan */
		poll.add(function() {
			return fs.exec('/sbin/logread', ['-e', 'tailscale'])
				.then(function (res) {
					if (res.code === 0) {
						var statusMappings = {
							'daemon.err': { status: 'StdErr', startIndex: 9 },
							'daemon.notice': { status: 'Info', startIndex: 10 }
						};
						self.logs = res.stdout.split('\n').map(function(log) {
							var logParts = log.split(' ').filter(Boolean);
							if (logParts.length >= 6) {
								var formattedTime = logParts[1] + ' ' + logParts[2] + ' - ' + logParts[3];
								var status = logParts[5];
								var mapping = statusMappings[status] || { status: status, startIndex: 9 };
								status = mapping.status;
								var startIndex = mapping.startIndex;
								var message = logParts.slice(startIndex).join(' ');
								return formattedTime + ' [ ' + status + ' ] - ' + message;
							} else {
								return '';
							}
						}).filter(Boolean);
						self.updateLogView();
					} else {
						throw new Error(res.stdout + ' ' + res.stderr);
					}
				})
		});
	},

	updateLogView: function() {
		var view = document.getElementById('syslog');
		var logs = this.logs;
		if (logs.length === 0) {
			view.textContent = _('No logs available');
			return;
		}
		if (this.reverseLogs) {
			logs = logs.slice().reverse();
		}
		view.textContent = logs.join('\n');
	},

	render: function () {
		var self = this;
		var button = E('button', {
			'class': 'cbi-button cbi-button-neutral',
			click: function() {
				self.reverseLogs = !self.reverseLogs;
				self.updateLogView();
			}
		}, _('Toggle Log Order'));
		var logArea = E('div', { 'id': 'syslog', 'style': 'white-space: pre;' });
		return E('div', {}, [ button, logArea ]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
