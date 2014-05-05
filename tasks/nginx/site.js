(function () {
  'use strict';

  /**
   * Create a new nginx site
   */
  var site = exports;

  var task = require('../../lib/task'),
    os = require('os'),
    rimraf = require('rimraf'),
    exec = require('execSync').exec,
    format = require('string-format'),
    fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    
    // nginx site template file path
    site_template_path = path.resolve(__dirname, 'xtuple-site.template');

  _.extend(site, task, /** @exports site */ {

    options: {
      domain: {
        optional: '[domain]',
        description: 'The public domain name that will point to this web server',
        value: 'localhost'
      }
    },

    /**
     * Integer offset from the Postgres cluster port that this site connects
     * to; used to assign the port that the nginx upstream server will listen
     * on.
    portOffset: 3011,

    /**
     * Generate 'sitename' value and format the domain argument if necessary
     * @override
     */
    beforeInstall: function (options) {
      options.nginx.sitename = 'xt-{version}-{name}'.format({
        name: options.xt.name,
        version: site.getScalarVersion(options)
      });
      options.nginx.hostname = '{nginx.sitename}.localhost'.format(options);
      options.nginx.sitesAvailable = path.resolve('/etc/nginx/sites-available');
      options.nginx.sitesEnabled = path.resolve('/etc/nginx/sites-enabled');
      options.nginx.availableSite = path.resolve(options.nginx.sitesAvailable, options.nginx.sitename);
      options.nginx.enabledSite = path.resolve(options.nginx.sitesEnabled, options.nginx.sitename);

      if (fs.existsSync(options.nginx.siteConfig)) {
        throw new Error('nginx site already exists for this account: '+ options.nginx.siteConfig);
      }

      if (options.nginx.domain === 'localhost') {
        options.nginx.domain = options.nginx.hostname;
      }
      options.nginx.healthfeedurl = '{nginx.domain}/_healthfeed'.format(options);
      options.nginx.lanEndpoints = (options.pg.mode === 'dedicated') && [
        '       localhost',
        '       (^127\\.0\\.0\\.1)',
        '       (^10\\.)',
        '       (^172\\.1[6-9]\\.)',
        '       (^172\\.2[0-9]\\.)',
        '       (^172\\.3[0-1]\\.)',
        '       (^192\\.168\\.)'
      ].join('\n');
    },

    /** @override */
    beforeTask: function (options) {
      options.nginx.port = require('../xt').serverconfig.getServerSSLPort(options);
      options.nginx.healthfeedport = options.nginx.port + 5984;
      exec('rm -f '+ path.resolve(options.nginx.sitesEnabled, 'default'));
      exec('service nginx reload');
    },

    /**
     * Generate and write nginx conf
     *  - proxy requests to the node server
     *  - auto-redirect http -> https
     *  - set up SSL
     *  @override
     */
    doTask: function (options) {
      var pg = options.pg,
        nginx_site_template = fs.readFileSync(site_template_path).toString(),
        nginx_conf = nginx_site_template.format(options).trim(),
        nginx_conf_path = path.resolve('/etc/nginx/sites-available', options.nginx.sitename),
        nginx_enabled_path = path.resolve('/etc/nginx/sites-enabled', options.nginx.sitename),
        nginx_default_enabled = path.resolve('/etc/nginx/sites-enabled', 'default'),
        nginx_default_available = path.resolve('/etc/nginx/sites-available', 'default'),
        etc_hosts_current;


      // write nginx site config file
      fs.writeFileSync(nginx_conf_path, nginx_conf);

      exec('ln -s {nginx.availableSite} {nginx.enabledSite}'.format(options));

      _.defaults(options.nginx.site, {
        json: options,
        string: nginx_conf
      });
    },

    /** @override */
    uninstall: function (options) {
      fs.unlinkSync(options.nginx.availableSite);
      fs.unlinkSync(options.nginx.enabledSite);
      exec('service nginx reload');
    },

    /**
     * Return a version with no dots, which makes more sense when used in a URL
     * or a database name than having punctuation.
     */
    getScalarVersion: function (options) {
      return String(options.xt.version).replace(/\./g, '');
    }
  });

})();
