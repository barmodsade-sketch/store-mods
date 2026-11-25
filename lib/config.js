'use strict';

function buildOrigin(envName, hostParts) {
    const custom = process.env[envName];
    if (custom && custom.trim()) {
        return custom.trim().replace(/\/+$/, '');
    }
    return ['https:/', hostParts.join('.')].join('/');
}

function getRuntimeConfig() {
    return {
        port: Number(process.env.PORT || 3000),
        vpsDomain: (process.env.VPS_DOMAIN || '').trim(),
        vpsAuth: (process.env.VPS_AUTH || '').trim(),
        vpsStatsPort: Number(process.env.VPS_STATS_PORT || 5889),
        vpsPanelPort: Number(process.env.VPS_PANEL_PORT || 5888),
        adminPin: (process.env.ADMIN_PIN || '').trim(),
        groqKey: (process.env.GROQ_API_KEY || '').trim(),
        groqModel: (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim(),
        botcahxKey: (process.env.BOTCAHX_APIKEY || '').trim(),
        kmspAuth: (process.env.KMSP_AUTH || '').trim(),
        kmspKey: (process.env.KMSP_API_KEY || '').trim(),
        upstreams: {
            yupra: buildOrigin('UPSTREAM_YUPRA_ORIGIN', ['cdn', 'yupra', 'my', 'id']),
            catbox: buildOrigin('UPSTREAM_CATBOX_ORIGIN', ['catbox', 'moe']),
            quax: buildOrigin('UPSTREAM_QUAX_ORIGIN', ['qu', 'ax']),
            pomf2: buildOrigin('UPSTREAM_POMF2_ORIGIN', ['pomf2', 'lain', 'la']),
            gofile: buildOrigin('UPSTREAM_GOFILE_ORIGIN', ['store1', 'gofile', 'io']),
            fadzzz: buildOrigin('UPSTREAM_FADZZZ_ORIGIN', ['fadzzzcloud', 'my', 'id']),
            bendith: buildOrigin('UPSTREAM_BENDITH_ORIGIN', ['bendith', 'my', 'id']),
            kmsp: buildOrigin('UPSTREAM_KMSP_ORIGIN', ['apigw', 'kmsp-store', 'com']),
            botcahx: buildOrigin('UPSTREAM_BOTCAHX_ORIGIN', ['api', 'botcahx', 'eu', 'org']),
            pinterest: buildOrigin('UPSTREAM_PINTEREST_ORIGIN', ['www', 'pinterest', 'com']),
            tikwm: buildOrigin('UPSTREAM_TIKWM_ORIGIN', ['www', 'tikwm', 'com']),
            groq: buildOrigin('UPSTREAM_GROQ_ORIGIN', ['api', 'groq', 'com']),
            ipwhois: buildOrigin('UPSTREAM_IPWHOIS_ORIGIN', ['ipwho', 'is']),
            crtsh: buildOrigin('UPSTREAM_CRTSH_ORIGIN', ['crt', 'sh'])
        }
    };
}

module.exports = {
    getRuntimeConfig
};
