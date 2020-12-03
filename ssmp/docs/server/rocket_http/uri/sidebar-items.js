initSidebarItems({"enum":[["Path","Marker type indicating use of a type for the path `UriPart` of a URI."],["Query","Marker type indicating use of a type for the query `UriPart` of a URI."],["SegmentError","Errors which can occur when attempting to interpret a segment string as a valid path segment."],["Uri","An `enum` encapsulating any of the possible URI variants."]],"struct":[["Absolute","A URI with a scheme, authority, path, and query: `http://user:pass@domain.com:4444/path?query`."],["Authority","A URI with an authority only: `user:pass@host:8000`."],["Error","Error emitted on URI parse failure."],["Formatter","A struct used to format strings for `UriDisplay`."],["Origin","A URI with an absolute path and optional query: `/path?query`."],["Segments","Iterator over the segments of an absolute URI path. Skips empty segments."]],"trait":[["FromUriParam","Conversion trait for parameters used in `uri!` invocations."],["Ignorable","Trait implemented by types that can be ignored in `uri!`."],["UriDisplay","Trait implemented by types that can be displayed as part of a URI in `uri!`."],["UriPart","Marker trait for types that mark a part of a URI."]]});