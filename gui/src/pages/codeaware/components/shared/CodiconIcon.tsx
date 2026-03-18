import React from "react";

/**
 * Codicon-derived SVG icons for visual consistency with VS Code.
 * Uses inline SVG paths instead of font files for reliable rendering in webviews.
 * Source: https://github.com/microsoft/vscode-codicons
 */

const CODICON_PATHS: Record<string, string> = {
  // unverified: question mark in circle with dashed border
  unverified:
    "M7.67 3.053a5 5 0 0 0-1.214.278l.375.928A4.1 4.1 0 0 1 7.99 4.01l.052-1a5 5 0 0 0-.371.043m2.543.677l-.532.848a4 4 0 0 1 .674.567l.696-.718a5 5 0 0 0-.838-.697M4.48 4.263a5 5 0 0 0-.759.876l.824.566a4 4 0 0 1 .532-.673zm7.34 1.519a4 4 0 0 1 .2.897l.983-.18a5 5 0 0 0-.261-1.1zM3.298 6.17l-.956-.296a5 5 0 0 0-.2 1.12l.994.1a4 4 0 0 1 .162-.924m9.712 1.834a4 4 0 0 1-.265.894l.915.404a5 5 0 0 0 .34-1.09zm-10 .155l-.988.152a5 5 0 0 0 .393 1.074l.893-.45a4 4 0 0 1-.3-.776zm9.182 2.088l.677.738a5 5 0 0 0 .56-.907l-.88-.476a4 4 0 0 1-.357.645m-7.765.741a4 4 0 0 1 .594.625l-.718.696a5 5 0 0 0-.728-.766zm6.526 1.131a4 4 0 0 1 .83.362l.476-.879a5 5 0 0 0-1.012-.45zm-5.14.186l-.38.926a5 5 0 0 0 1.036.399l.296-.955a4 4 0 0 1-.953-.37m3.68.572a4 4 0 0 1 .893.117l.246-.97a5 5 0 0 0-1.098-.147zM6.1 7.039a1.5 1.5 0 0 1 .46-1.083 1.54 1.54 0 0 1 1.084-.457q.294 0 .57.115a1.5 1.5 0 0 1 .483.326q.207.21.326.484.12.273.118.569v.27H7.875v-.233a.37.37 0 0 0-.112-.268.37.37 0 0 0-.271-.112.36.36 0 0 0-.267.115.38.38 0 0 0-.108.27.7.7 0 0 0 .068.272q.065.137.167.263a4 4 0 0 0 .24.248l.185.175.24.249q.131.14.238.273a2 2 0 0 1 .18.293q.08.158.08.345a1.52 1.52 0 0 1-.46 1.088 1.58 1.58 0 0 1-1.087.454 1.54 1.54 0 0 1-1.088-.456 1.51 1.51 0 0 1-.451-1.083h1.013a.37.37 0 0 0 .113.268.37.37 0 0 0 .271.112.4.4 0 0 0 .151-.032.4.4 0 0 0 .13-.087.4.4 0 0 0 .09-.13.4.4 0 0 0 .032-.152.7.7 0 0 0-.065-.268 2 2 0 0 0-.163-.26 3 3 0 0 0-.233-.246l-.186-.178a5 5 0 0 1-.244-.252 2 2 0 0 1-.243-.282 2 2 0 0 1-.18-.3 1 1 0 0 1-.08-.315z",
  // bookmark (outline)
  bookmark:
    "M12 1H4a1 1 0 0 0-1 1v12.5l.5.5 4-2.5 4 2.5.5-.5V2a1 1 0 0 0-1-1zm0 12.25l-3.5-2.188L5 13.25V2h7v11.25z",
  // trash
  trash:
    "M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm1 2h1v5H6V6zm3 0h1v5H9V6z",
};

interface CodiconIconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a VS Code Codicon icon as inline SVG.
 * Usage: <CodiconIcon name="bookmark" />
 */
export const CodiconIcon: React.FC<CodiconIconProps> = ({
  name,
  className = "",
  style,
}) => {
  const path = CODICON_PATHS[name];
  if (!path) {
    return null;
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={path} />
    </svg>
  );
};

export default CodiconIcon;
