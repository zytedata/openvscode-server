import {renderMarkdownDocument} from '../../../../../../../../src/vs/workbench/contrib/markdown/browser/markdownDocumentRenderer';

const markdownContent = renderMarkdownDocument(require('../media/ports.md'));

export default () => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
</head>
<body>
<h1>Howdy!</h1>
    <img src="https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif" width="300" />
</body>
</html>`;
