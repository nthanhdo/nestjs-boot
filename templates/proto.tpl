syntax = "proto3";

package {{name}};

service {{name}}Service {
  rpc GetHello (Empty) returns (HelloResponse);
}

message Empty {}

message HelloResponse {
  string message = 1;
  string service = 2;
}
