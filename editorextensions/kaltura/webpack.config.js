const path = require('path');

module.exports = {
    entry: {
        'extension': './src/extension.ts',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /[\\\/]resources[\\\/]/,
                use: 'raw-loader',
                exclude: /\.json$/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'bin/[name].js',
        path: __dirname,
    },
    // Production mode: no eval()-wrapped modules (which Lucid's sandbox CSP can block) and a
    // smaller bundle. Source maps are omitted from the shipped file.
    mode: 'production',
    devtool: false,
};
