initSidebarItems({"mod":[["algorithm","Algorithms capable of signing and verifying tokens. By default only the `hmac` crate's `Hmac` type is supported. For more algorithms, enable the feature `openssl` and see the openssl module. The `none` algorithm is explicitly not supported."],["claims","Convenience structs for commonly defined fields in claims."],["error",""],["header","Convenience structs for commonly defined fields in headers."],["token","A structured representation of a JWT."]],"struct":[["Token","Representation of a structured JWT. Methods vary based on the signature type `S`."]],"trait":[["FromBase64","A trait used to parse objects from base64 encoding. The return type can be either owned if the header is dynamic, or it can be borrowed if the header is a static, pre-computed value. It is implemented automatically for every type that implements DeserializeOwned for the base64 encoded JSON representation."],["ToBase64","A trait used to convert objects in base64 encoding. The return type can be either owned if the header is dynamic, or it can be borrowed if the header is a static, pre-computed value. It is implemented automatically for every type that implements Serialize. as a base64 encoding of the object's JSON representation."]]});